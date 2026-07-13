import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Admin access required' }, { status: 403 });

    const { action, ...params } = await req.json();

    switch (action) {
      case 'list_advisors': {
        const advisors = await base44.asServiceRole.entities.Advisor.list('-created_date', 500);
        return Response.json({ advisors });
      }
      case 'update_advisor': {
        const { advisor_id, ...updates } = params;
        if (!advisor_id) return Response.json({ error: 'advisor_id required' }, { status: 400 });
        const updated = await base44.asServiceRole.entities.Advisor.update(advisor_id, updates);
        return Response.json({ advisor: updated });
      }
      case 'list_usage': {
        const logs = await base44.asServiceRole.entities.AIUsageLog.list('-created_date', 200);
        return Response.json({ logs });
      }
      case 'get_limits': {
        const limits = await base44.asServiceRole.entities.SystemLimits.list('-created_date', 1);
        return Response.json({ limits: limits[0] || null });
      }
      case 'update_limits': {
        const { limits_id, ...updates } = params;
        let result;
        if (limits_id) {
          result = await base44.asServiceRole.entities.SystemLimits.update(limits_id, updates);
        } else {
          result = await base44.asServiceRole.entities.SystemLimits.create(updates);
        }
        return Response.json({ limits: result });
      }
      case 'list_models': {
        const models = await base44.asServiceRole.entities.AIModelConfigurations.list('-created_date', 100);
        return Response.json({ models });
      }
      default:
        return Response.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (error) {
    console.error('adminApi error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});