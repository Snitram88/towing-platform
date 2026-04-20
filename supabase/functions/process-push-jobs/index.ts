import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';

type PushJob = {
  id: number;
  user_id: string;
  app_role: 'driver' | 'customer';
  title: string;
  body: string;
  data: Record<string, unknown>;
  job_type: string;
  attempts: number;
  max_attempts: number;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  try {
    const internalSecret = Deno.env.get('PUSH_INTERNAL_SECRET');
    const providedSecret = req.headers.get('x-internal-secret');

    if (!internalSecret || providedSecret !== internalSecret) {
      return jsonResponse({ success: false, error: 'Unauthorized' }, 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ success: false, error: 'Missing function secrets' }, 500);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data, error } = await supabase.rpc('claim_push_jobs', { p_limit: 25 });

    if (error) {
      return jsonResponse({ success: false, error: error.message }, 500);
    }

    const jobs = (data ?? []) as PushJob[];

    if (jobs.length === 0) {
      return jsonResponse({ success: true, processed: 0 });
    }

    const results: Array<Record<string, unknown>> = [];

    for (const job of jobs) {
      try {
        const sendResponse = await fetch(`${supabaseUrl}/functions/v1/send-push`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-internal-secret': internalSecret,
          },
          body: JSON.stringify({
            userId: job.user_id,
            appRole: job.app_role,
            title: job.title,
            body: job.body,
            data: job.data ?? {},
          }),
        });

        const sendJson = await sendResponse.json().catch(() => ({}));

        const expoEntry = Array.isArray((sendJson as any)?.expo?.data)
          ? (sendJson as any).expo.data[0]
          : null;

        const ok =
          sendResponse.ok &&
          (sendJson as any)?.success === true &&
          (!expoEntry || expoEntry.status === 'ok');

        await supabase.rpc('finish_push_job', {
          p_job_id: job.id,
          p_success: ok,
          p_expo_response: sendJson,
          p_error: ok
            ? null
            : expoEntry?.message ??
              (sendJson as any)?.error ??
              `HTTP ${sendResponse.status}`,
        });

        results.push({
          jobId: job.id,
          success: ok,
          response: sendJson,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown push error';

        await supabase.rpc('finish_push_job', {
          p_job_id: job.id,
          p_success: false,
          p_expo_response: null,
          p_error: message,
        });

        results.push({
          jobId: job.id,
          success: false,
          error: message,
        });
      }
    }

    return jsonResponse({
      success: true,
      processed: jobs.length,
      results,
    });
  } catch (err) {
    return jsonResponse(
      {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown processor error',
      },
      500
    );
  }
});
