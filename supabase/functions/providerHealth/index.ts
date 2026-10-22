// providerHealth: every 5 minutes while calls are failing (pg_cron, see
// 20261015160000_provider_alerts.sql), names the failing provider and why on
// the Admin page, and emails the owner once per incident. Service role only.
// The email needs two Supabase secrets the owner sets: RESEND_API_KEY and
// ALERT_EMAIL_TO (optionally ALERT_EMAIL_FROM). Without them, nothing is
// sent and the Admin page still shows the alert.
// deno-lint-ignore-file no-explicit-any
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { isServiceCall } from '../_shared/meetingDriver.ts';
import { NEW_INCIDENT_GAP_MS, WINDOW_MS, alertText, describe, findFailures, shouldEmail, testEmail } from '../_shared/providerHealth.ts';

const json = (body: unknown, status = 200) => Response.json(body, { status });

async function email(subject: string, text: string) {
  const key = Deno.env.get('RESEND_API_KEY');
  const to = Deno.env.get('ALERT_EMAIL_TO');
  if (!key || !to) return 'not set up';
  const res = await fetch(Deno.env.get('RESEND_API_URL') || 'https://api.resend.com/emails', {
    method: 'POST', signal: AbortSignal.timeout(8000),
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      from: Deno.env.get('ALERT_EMAIL_FROM') || 'Just Ask The Room <alerts@justasktheroom.com>',
      to: to.split(',').map((s) => s.trim()).filter(Boolean), subject, text,
    }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return 'sent';
}

Deno.serve(async (req) => {
  if (!isServiceCall(req)) return json({ error: 'Unauthorized' }, 401);
  const { action } = (await req.json().catch(() => null)) || {};
  // One test email, on request: checks the secrets and that mail arrives.
  if (action === 'test') {
    try {
      const t = testEmail();
      return json({ test: await email(t.subject, t.text) });
    } catch (e) {
      console.error('providerHealth: the test email failed:', (e as Error).message);
      return json({ test: 'failed', error: (e as Error).message }, 502);
    }
  }
  try {
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const since = new Date(Date.now() - WINDOW_MS).toISOString();
    const { data: rows, error } = await db.from('ai_usage_logs')
      .select('provider, model, status, error_code, attempts, created_at')
      .gte('created_at', since).in('status', ['fallback_used', 'error']).limit(1000);
    if (error) throw error;

    const results: any[] = [];
    for (const g of findFailures(rows || [])) {
      const d = describe(g);
      const { data: existing } = await db.from('provider_health_alerts').select('*')
        .eq('provider', g.provider).eq('alert_type', 'error').maybeSingle();
      const now = Date.now();
      const fresh = !existing || now - new Date(existing.last_seen).getTime() > NEW_INCIDENT_GAP_MS;
      const send = shouldEmail(existing, now);
      const row = {
        provider: g.provider, alert_type: 'error', message: d.message, reason: d.reason, occurrence_count: g.calls,
        last_seen: new Date(now).toISOString(), acknowledged: false, acknowledged_at: null, acknowledged_by: null,
        ...(fresh ? { first_seen: new Date(now).toISOString(), emailed_at: null } : {}),
      };
      const { error: upErr } = await db.from('provider_health_alerts').upsert(row, { onConflict: 'provider,alert_type' });
      if (upErr) throw upErr;

      let mailed = 'not needed';
      if (send) {
        try {
          mailed = await email(d.subject, alertText(d));
          if (mailed === 'sent') {
            const { error: markErr } = await db.from('provider_health_alerts').update({ emailed_at: new Date().toISOString() }).eq('provider', g.provider).eq('alert_type', 'error');
            if (markErr) console.error("providerHealth: couldn't record the email; the next check may send it again:", markErr.message);
          }
        } catch (e) {
          mailed = 'failed';
          console.error('providerHealth: the alert email failed:', (e as Error).message);
        }
      }
      results.push({ provider: g.provider, reason: d.reason, calls: g.calls, email: mailed });
    }
    return json({ alerts: results });
  } catch (error) {
    console.error('providerHealth error:', (error as Error).message);
    return json({ error: 'Provider check failed.' }, 500);
  }
});
