import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { subscription_id } = await req.json();
    if (!subscription_id) return Response.json({ error: 'subscription_id required' }, { status: 400 });

    const WIX_API_KEY = Deno.env.get('WIX_PAYMENTS_API_KEY');
    const WIX_SITE_ID = Deno.env.get('WIX_PAYMENTS_SITE_ID');

    const response = await fetch(`https://www.wixapis.com/payments/base44/v1/subscriptions/${subscription_id}/cancel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: WIX_API_KEY,
        'wix-site-id': WIX_SITE_ID,
      },
      body: JSON.stringify({ subscription_id, reason: 'Advisor removed from team', immediate: true }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      console.error('cancel error', response.status, JSON.stringify(data));
      return Response.json({ error: 'Failed to cancel subscription' }, { status: 500 });
    }

    const subs = await base44.asServiceRole.entities.Subscription.filter({ subscription_id });
    for (const s of subs) {
      await base44.asServiceRole.entities.Subscription.update(s.id, { status: 'canceled' });
    }

    return Response.json({ ok: true });
  } catch (error) {
    console.error('cancel-subscription error', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});