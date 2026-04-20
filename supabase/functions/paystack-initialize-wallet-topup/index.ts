import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function generateReference(customerId: string) {
  const compactUser = customerId.replace(/-/g, '').slice(0, 12);
  const rand = crypto.randomUUID().replace(/-/g, '').slice(0, 10);
  return `wlt-${compactUser}-${Date.now()}-${rand}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const paystackSecretKey = Deno.env.get('PAYSTACK_SECRET_KEY');
    const callbackUrl = Deno.env.get('PAYSTACK_CALLBACK_URL');

    if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey || !paystackSecretKey) {
      return json({ error: 'Missing required function secrets' }, 500);
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: req.headers.get('Authorization') ?? '',
        },
      },
    });

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return json({ error: 'Unauthorized' }, 401);
    }

    const body = await req.json().catch(() => null);
    const amountNaira = Number(body?.amount);

    if (!Number.isFinite(amountNaira) || amountNaira <= 0) {
      return json({ error: 'Amount must be greater than 0' }, 400);
    }

    const normalizedAmount = Number(amountNaira.toFixed(2));
    const amountSubunit = Math.round(normalizedAmount * 100);

    const { data: profileRow, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('full_name, email')
      .eq('id', user.id)
      .maybeSingle();

    if (profileError) {
      return json({ error: profileError.message }, 500);
    }

    const email = profileRow?.email ?? user.email ?? null;

    if (!email) {
      return json({ error: 'Customer email is required before wallet top-up can start' }, 400);
    }

    await supabaseAdmin.from('customer_wallets').upsert(
      {
        customer_id: user.id,
        currency: 'NGN',
      },
      { onConflict: 'customer_id' }
    );

    const reference = generateReference(user.id);

    const { data: walletTx, error: walletTxError } = await supabaseAdmin
      .from('wallet_transactions')
      .insert({
        customer_id: user.id,
        transaction_type: 'topup',
        amount: normalizedAmount,
        currency: 'NGN',
        status: 'pending',
        provider: 'paystack',
        description: 'Wallet top-up initialized',
        metadata: {
          reference,
          purpose: 'wallet_topup',
        },
      })
      .select('id')
      .single();

    if (walletTxError || !walletTx) {
      return json({ error: walletTxError?.message ?? 'Could not create wallet transaction' }, 500);
    }

    const { error: paystackTxInsertError } = await supabaseAdmin
      .from('paystack_transactions')
      .insert({
        customer_id: user.id,
        wallet_transaction_id: walletTx.id,
        purpose: 'wallet_topup',
        reference,
        email,
        amount: normalizedAmount,
        amount_subunit: amountSubunit,
        currency: 'NGN',
        paystack_status: 'initialized',
        metadata: {
          customer_id: user.id,
          purpose: 'wallet_topup',
          wallet_transaction_id: walletTx.id,
          source: 'customer_app',
        },
      });

    if (paystackTxInsertError) {
      await supabaseAdmin
        .from('wallet_transactions')
        .update({
          status: 'failed',
          description: 'Failed before Paystack initialization',
        })
        .eq('id', walletTx.id);

      return json({ error: paystackTxInsertError.message }, 500);
    }

    const paystackPayload: Record<string, unknown> = {
      email,
      amount: String(amountSubunit),
      currency: 'NGN',
      reference,
      metadata: JSON.stringify({
        customer_id: user.id,
        purpose: 'wallet_topup',
        wallet_transaction_id: walletTx.id,
        source: 'customer_app',
      }),
    };

    if (callbackUrl) {
      paystackPayload.callback_url = callbackUrl;
    }

    const paystackRes = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${paystackSecretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(paystackPayload),
    });

    const paystackJson = await paystackRes.json().catch(() => null);

    if (!paystackRes.ok || !paystackJson?.status || !paystackJson?.data?.authorization_url) {
      await supabaseAdmin
        .from('wallet_transactions')
        .update({
          status: 'failed',
          description: 'Paystack initialization failed',
          metadata: {
            reference,
            purpose: 'wallet_topup',
            paystack_response: paystackJson,
          },
        })
        .eq('id', walletTx.id);

      await supabaseAdmin
        .from('paystack_transactions')
        .update({
          paystack_status: 'failed',
          raw_response: paystackJson,
          gateway_response: paystackJson?.message ?? 'Initialization failed',
        })
        .eq('reference', reference);

      return json(
        { error: paystackJson?.message ?? 'Paystack initialization failed' },
        400
      );
    }

    await supabaseAdmin
      .from('paystack_transactions')
      .update({
        paystack_status: 'pending',
        authorization_url: paystackJson.data.authorization_url,
        access_code: paystackJson.data.access_code ?? null,
        raw_response: paystackJson,
      })
      .eq('reference', reference);

    return json({
      success: true,
      message: 'Wallet top-up initialized',
      data: {
        reference,
        authorization_url: paystackJson.data.authorization_url,
        access_code: paystackJson.data.access_code,
        amount: normalizedAmount,
        currency: 'NGN',
      },
    });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : 'Unexpected error' },
      500
    );
  }
});
