// Test accounts for clicking through Workstream S (Teams) on the LOCAL stack
// only. Never run against production. Safe to re-run.
//   LOCAL_URL=… LOCAL_SERVICE_KEY=… deno run -A supabase/tests/local/s_seed_users.ts
import { createClient } from 'npm:@supabase/supabase-js@2';
const URL = Deno.env.get('LOCAL_URL') || 'http://127.0.0.1:54321';
if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(URL)) throw new Error('Local stack only');
const admin = createClient(URL, Deno.env.get('LOCAL_SERVICE_KEY')!, { auth: { persistSession: false } });

// Local-only passwords for local-only accounts.
export const USERS = {
  owner: { email: 's-owner@example.test', password: 'local-s-owner-pass', company: "Hartley's Deli" },
  manager: { email: 's-manager@example.test', password: 'local-s-manager-pass', company: null },
  member: { email: 's-member@example.test', password: 'local-s-member-pass', company: null },
  outsider: { email: 's-outsider@example.test', password: 'local-s-outsider-pass', company: 'Elsewhere Ltd' },
};

const { data: existing } = await admin.auth.admin.listUsers({ perPage: 1000 });
for (const [name, u] of Object.entries(USERS)) {
  let id = existing.users.find((x) => x.email === u.email)?.id;
  if (!id) {
    const { data, error } = await admin.auth.admin.createUser({ email: u.email, password: u.password, email_confirm: true });
    if (error) throw error;
    id = data.user.id;
  }
  if (u.company) {
    const { data: has } = await admin.from('companies').select('id').eq('created_by_id', id).eq('name', u.company);
    if (!has?.length) await admin.from('companies').insert({ name: u.company, created_by_id: id, description: `Local test company for ${name}.` });
  }
  console.log(`${name}: ${u.email}`);
}
