import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-internal-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type PushRequest = {
  userId?: string;
  appRole?: 'driver' | 'customer';
  tokens?: string[];
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: 'default' | null;
  channelId?: string;
};

function isExpoPushToken(value: string) {
  return value.startsWith('ExponentPushToken[') || value.startsWith('ExpoPushToken[');
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const internalSecret = Deno.env.get('PUSH_INTERNAL_SECRET');
    const providedSecret = req.headers.get('x-internal-secret');

    if (internalSecret && providedSecret !== internalSecret) {
      return jsonResponse({ success: false, error: 'Unauthorized' }, 401);
    }

    const body = (await req.json()) as PushRequest;

    if (!body.title || !body.body) {
      return jsonResponse(
        { success: false, error: 'title and body are required' },
        400
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse(
        { success: false, error: 'Missing Supabase function secrets' },
        500
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    let tokens = Array.isArray(body.tokens) ? body.tokens : [];

    if ((!tokens || tokens.length === 0) && body.userId) {
      const query = supabase
        .from('push_devices')
        .select('expo_push_token')
        .eq('user_id', body.userId)
        .eq('is_active', true);

      const scopedQuery = body.appRole ? query.eq('app_role', body.appRole) : query;
      const { data, error } = await scopedQuery;

      if (error) {
        throw error;
      }

      tokens = (data ?? []).map((item) => item.expo_push_token);
    }

    const uniqueTokens = Array.from(new Set(tokens.filter(isExpoPushToken)));

    if (uniqueTokens.length === 0) {
      return jsonResponse({
        success: true,
        sent: 0,
        message: 'No active push tokens found',
      });
    }

    const messages = uniqueTokens.map((token) => ({
      to: token,
      sound: body.sound ?? 'default',
      title: body.title,
      body: body.body,
      data: body.data ?? {},
      channelId: body.channelId ?? 'default',
      priority: 'high',
    }));

    const expoResponse = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
    });

    const expoJson = await expoResponse.json();

    return jsonResponse({
      success: expoResponse.ok,
      sent: uniqueTokens.length,
      expo: expoJson,
    }, expoResponse.ok ? 200 : 500);
  } catch (error) {
    return jsonResponse(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown send-push failure',
      },
      500
    );
  }
});
