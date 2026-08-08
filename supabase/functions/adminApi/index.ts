import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Unlike the other Edge Functions, this one keeps Supabase's "Enforce JWT
// Verification" setting ON, and must stay that way — do not deploy it with
// --no-verify-jwt. The others need it off because they are invoked
// server-to-server with the service-role key; this one is only ever called
// from the frontend with a user JWT, so platform verification costs nothing
// and keeps a second gate in front of the service-role key used below.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authClient = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_ANON_KEY'),
      { global: { headers: { Authorization: req.headers.get('Authorization') } } }
    );
    const { data: { user }, error: authErr } = await authClient.auth.getUser();
    if (authErr || !user) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });

    const db = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));

    const { data: profile } = await db.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') return Response.json({ error: 'Admin access required' }, { status: 403, headers: corsHeaders });

    const { action, ...params } = await req.json();

    switch (action) {
      case 'list_advisors': {
        const { data: advisors, error } = await db.from('advisors').select('*').order('created_at', { ascending: false }).limit(500);
        if (error) throw error;
        return Response.json({ advisors }, { headers: corsHeaders });
      }
      case 'update_advisor': {
        const { advisor_id, ...updates } = params;
        if (!advisor_id) return Response.json({ error: 'advisor_id required' }, { status: 400, headers: corsHeaders });
        const { data: advisor, error } = await db.from('advisors').update(updates).eq('id', advisor_id).select().single();
        if (error) throw error;
        return Response.json({ advisor }, { headers: corsHeaders });
      }
      case 'list_usage': {
        const { data: logs, error } = await db.from('ai_usage_logs').select('*').order('created_at', { ascending: false }).limit(200);
        if (error) throw error;
        return Response.json({ logs }, { headers: corsHeaders });
      }
      case 'get_limits': {
        const { data: limitsList, error } = await db.from('system_limits').select('*').order('created_at', { ascending: false }).limit(1);
        if (error) throw error;
        return Response.json({ limits: limitsList?.[0] || null }, { headers: corsHeaders });
      }
      case 'update_limits': {
        const { limits_id, ...updates } = params;
        let result;
        if (limits_id) {
          const { data, error } = await db.from('system_limits').update(updates).eq('id', limits_id).select().single();
          if (error) throw error;
          result = data;
        } else {
          const { data, error } = await db.from('system_limits').insert(updates).select().single();
          if (error) throw error;
          result = data;
        }
        return Response.json({ limits: result }, { headers: corsHeaders });
      }
      case 'list_models': {
        const { data: models, error } = await db.from('ai_model_configurations').select('*').order('created_at', { ascending: false }).limit(100);
        if (error) throw error;
        return Response.json({ models }, { headers: corsHeaders });
      }
      default:
        return Response.json({ error: 'Unknown action' }, { status: 400, headers: corsHeaders });
    }
  } catch (error) {
    console.error('adminApi error:', error);
    return Response.json({ error: error.message }, { status: 500, headers: corsHeaders });
  }
});
