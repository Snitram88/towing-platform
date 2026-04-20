import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const jsonHeaders = {
  'Content-Type': 'application/json',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

async function hmacSha512Hex(secret: string, payload: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-512' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(payload)
  );

  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: jsonHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const paystackSecretKey = Deno.env.get('PAYSTACK_SECRET_KEY');

    if (!supabaseUrl || !serviceRoleKey || !paystackSecretKey) {
      return json({ error: 'Missing required function secrets' }, 500);
    }

    const rawBody = await req.text();
    const providedSignature = req.headers.get('x-paystack-signature') ?? '';
    const expectedSignature = await hmacSha512Hex(paystackSecretKey, rawBody);

    if (!providedSignature || providedSignature !== expectedSignature) {
      return json({ error: 'Invalid webhook signature' }, 401);
    }

    const event = JSON.parse(rawBody);
    const eventType = event?.event;
    const reference = event?.data?.reference ?? null;

    if (!reference) {
      return json({ received: true, ignored: true, reason: 'missing_reference' });
    }

    if (eventType !== 'charge.success') {
      return json({ received: true, ignored: true, reason: `ignored_${eventType}` });
    }

    const verifyRes = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${paystackSecretKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const verifyJson = await verifyRes.json().catch(() => null);

    if (!verifyRes.ok || !verifyJson?.status) {
      return json(
        {
          error: 'Could not verify Paystack transaction',
          details: verifyJson,
        },
        500
      );
    }

    if (verifyJson?.data?.status !== 'success') {
      return json({
        received: true,
        ignored: true,
        reason: `verify_status_${verifyJson?.data?.status ?? 'unknown'}`,
      });
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const { data: paystackRow, error: paystackRowError } = await supabaseAdmin
      .from('paystack_transactions')
      .select('reference, purpose, paystack_status')
      .eq('reference', reference)
      .maybeSingle();

    if (paystackRowError) {
      return json({ error: paystackRowError.message }, 500);
    }

    if (!paystackRow) {
      return json({ received: true, ignored: true, reason: 'unknown_reference' });
    }

    if (paystackRow.paystack_status === 'success') {
      return json({ received: true, already_processed: true, reference });
    }

    const paidAt =
      verifyJson?.data?.paid_at ??
      verifyJson?.data?.paidAt ??
      verifyJson?.data?.transaction_date ??
      null;

    const { data: applyResult, error: applyError } = await supabaseAdmin.rpc(
      'apply_paystack_wallet_topup',
      {
        p_reference: reference,
        p_paystack_transaction_id: verifyJson.data.id,
        p_channel: verifyJson.data.channel ?? null,
        p_gateway_response: verifyJson.data.gateway_response ?? null,
        p_paid_at: paidAt,
        p_raw_response: verifyJson,
      }
    );

    if (applyError) {
      return json({ error: applyError.message }, 500);
    }

    return json({
      received: true,
      applied: true,
      reference,
      result: applyResult,
    });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : 'Unexpected webhook error' },
      500
    );
  }
});
