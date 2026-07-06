import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import jwt from 'npm:jsonwebtoken@9.0.2';

Deno.serve(async (req) => {
  try {
    const PUBLIC_KEY = Deno.env.get('WIX_PAYMENTS_WEBHOOK_PUBLIC_KEY');
    if (!PUBLIC_KEY) {
      console.error('Missing WIX_PAYMENTS_WEBHOOK_PUBLIC_KEY');
      return new Response('Missing key', { status: 500 });
    }

    const body = await req.text();

    let rawPayload;
    try {
      rawPayload = jwt.verify(body, PUBLIC_KEY, { algorithms: ['RS256'] });
    } catch (e) {
      console.error('JWT verification failed', e.message);
      return new Response('Invalid signature', { status: 401 });
    }

    const event = JSON.parse(rawPayload.data);
    const eventData = JSON.parse(event.data);

    const base44 = createClientFromRequest(req);

    if (event.eventType === 'wix.ecom.v1.order_approved') {
      const order = eventData.actionEvent.body.order;
      const checkoutId = order.checkoutId;
      let subscriptionId = null;
      for (const lineItem of order.lineItems || []) {
        if (lineItem.subscriptionInfo) {
          subscriptionId = lineItem.subscriptionInfo.id;
          break;
        }
      }
      if (subscriptionId && checkoutId) {
        const pending = await base44.asServiceRole.entities.Subscription.filter({ checkout_id: checkoutId });
        for (const sub of pending) {
          if (sub.status !== 'active') {
            await base44.asServiceRole.entities.Subscription.update(sub.id, {
              subscription_id: subscriptionId,
              status: 'active',
            });
          }
        }
      }
    } else if (
      event.eventType === 'wix.ecom.subscription_contracts.v1.subscription_contract_canceled' ||
      event.eventType === 'wix.ecom.subscription_contracts.v1.subscription_contract_expired'
    ) {
      const subscriptionContract = eventData.actionEvent.body.subscriptionContract;
      const subscriptionId = subscriptionContract.id;
      const subs = await base44.asServiceRole.entities.Subscription.filter({ subscription_id: subscriptionId });
      for (const sub of subs) {
        await base44.asServiceRole.entities.Subscription.update(sub.id, { status: 'canceled' });
        if (sub.advisor_id) {
          await base44.asServiceRole.entities.Advisor.delete(sub.advisor_id).catch(() => {});
        }
      }
    }

    return new Response('OK', { status: 200 });
  } catch (error) {
    console.error('webhook error', error);
    return new Response('Error', { status: 500 });
  }
});