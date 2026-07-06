import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { company_id, advisor_id, advisor_name, origin: payloadOrigin } = await req.json();
    if (!company_id || !advisor_id) {
      return Response.json({ error: 'company_id and advisor_id are required' }, { status: 400 });
    }

    const WIX_API_KEY = Deno.env.get('WIX_PAYMENTS_API_KEY');
    const WIX_SITE_ID = Deno.env.get('WIX_PAYMENTS_SITE_ID');
    if (!WIX_API_KEY || !WIX_SITE_ID) {
      console.error('Missing Wix Payments env vars');
      return Response.json({ error: 'Payments not configured' }, { status: 500 });
    }

    const referer = req.headers.get('referer');
    const origin =
      req.headers.get('origin') ||
      (referer ? (() => { try { return new URL(referer).origin; } catch { return ''; } })() : '') ||
      (req.headers.get('x-forwarded-host') ? `https://${req.headers.get('x-forwarded-host')}` : '') ||
      payloadOrigin ||
      '';
    if (!origin) {
      return Response.json({ error: 'Unable to determine app URL — missing Origin header' }, { status: 500 });
    }

    const cart = {
      items: [
        {
          name: `Advisor: ${advisor_name || 'Executive Advisor'}`,
          quantity: 1,
          price: '9.00',
          subscriptionInfo: {
            subscriptionSettings: { frequency: 'MONTH' },
            title: 'Executive Advisor',
            description: 'One AI executive advisor on your boardroom team, billed monthly at £9/month.',
          },
        },
      ],
      customerInfo: { email: user.email },
    };

    const callbackUrls = {
      postFlowUrl: `${origin}/company/${company_id}/team`,
      thankYouPageUrl: `${origin}/subscription-confirmed?company=${company_id}`,
    };

    const response = await fetch('https://www.wixapis.com/payments/platform/v1/checkout-sessions/construct', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: WIX_API_KEY,
        'wix-site-id': WIX_SITE_ID,
      },
      body: JSON.stringify({ cart, callbackUrls }),
    });

    const data = await response.json();
    if (!response.ok) {
      console.error('Wix checkout error', response.status, JSON.stringify(data));
      return Response.json({ error: data?.message || 'Failed to create checkout' }, { status: 500 });
    }

    const checkoutId = data.checkoutSession.id;
    const redirectUrl = data.checkoutSession.redirectUrl;

    await base44.entities.Subscription.create({
      user_id: user.id,
      company_id,
      advisor_id,
      advisor_name: advisor_name || '',
      checkout_id: checkoutId,
      status: 'pending',
    });

    return Response.json({ redirectUrl });
  } catch (error) {
    console.error('create-checkout error', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});