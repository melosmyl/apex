import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseKey);

const TABLES = {
  Company: 'companies',
  Advisor: 'advisors',
  Project: 'projects',
  BoardMeeting: 'board_meetings',
  MeetingMessage: 'meeting_messages',
  VoiceMeetingSession: 'voice_meeting_sessions',
  Decision: 'decisions',
  Task: 'tasks',
  Document: 'documents',
  DocumentDownloadLog: 'document_download_logs',
  Pin: 'pins',
  Subscription: 'subscriptions',
  AIModelConfigurations: 'ai_model_configurations',
  AIUsageLog: 'ai_usage_logs',
  DeliverableGenerationLog: 'deliverable_generation_logs',
  SystemLimits: 'system_limits',
  Note: 'notes',
  AssistantEvent: 'assistant_events',
  ProgressionTree: 'progression_trees',
  ProgressionNode: 'progression_nodes',
  ProgressionNodeCompletion: 'progression_node_completions',
};

function parseSort(sort) {
  if (!sort) return null;
  const descending = sort.startsWith('-');
  let field = descending ? sort.slice(1) : sort;
  if (field === 'created_date') field = 'created_at';
  if (field === 'updated_date') field = 'updated_at';
  return { field, ascending: !descending };
}

function applySort(query, sort) {
  const parsed = parseSort(sort);
  if (!parsed) return query;
  return query.order(parsed.field, { ascending: parsed.ascending });
}

// The frontend still calls entities the Base44 way (~40 files, per
// AGENTS.md), which means every row is expected to carry created_date /
// updated_date. Real Postgres rows only have created_at / updated_at — this
// was previously translated for sort-key strings (parseSort) but never for
// the data actually returned, so every consumer reading row.created_date
// silently got undefined. Alias both directions here, once, rather than
// patching each of the ~15 call sites that read the old names.
function withDateAliases(row) {
  if (!row || typeof row !== 'object') return row;
  if (row.created_at !== undefined && row.created_date === undefined) row.created_date = row.created_at;
  if (row.updated_at !== undefined && row.updated_date === undefined) row.updated_date = row.updated_at;
  return row;
}

function unwrap({ data, error }) {
  if (error) throw error;
  if (Array.isArray(data)) return data.map(withDateAliases);
  return withDateAliases(data);
}

function createEntityClient(tableName) {
  return {
    async list(sort, limit) {
      let q = supabase.from(tableName).select('*');
      q = applySort(q, sort);
      if (limit) q = q.limit(limit);
      return unwrap(await q);
    },

    async filter(query = {}, sort, limit) {
      let q = supabase.from(tableName).select('*').match(query);
      q = applySort(q, sort);
      if (limit) q = q.limit(limit);
      return unwrap(await q);
    },

    async get(id) {
      return unwrap(
        await supabase.from(tableName).select('*').eq('id', id).single()
      );
    },

    async create(data) {
      return unwrap(
        await supabase.from(tableName).insert(data).select().single()
      );
    },

    async update(id, data) {
      return unwrap(
        await supabase.from(tableName).update(data).eq('id', id).select().single()
      );
    },

    async delete(id) {
      return unwrap(await supabase.from(tableName).delete().eq('id', id));
    },

    async bulkCreate(dataArray) {
      return unwrap(await supabase.from(tableName).insert(dataArray).select());
    },
  };
}

const entities = Object.fromEntries(
  Object.entries(TABLES).map(([name, table]) => [name, createEntityClient(table)])
);

async function fetchProfile(authUser) {
  const { data: profile, error } = await supabase.rpc('get_my_profile');
  if (error) throw error;
  return {
    id: authUser.id,
    email: authUser.email,
    role: profile?.role || 'user',
  };
}

const auth = {
  async me() {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
      const err = new Error('Not authenticated');
      err.status = 401;
      throw err;
    }
    return fetchProfile(user);
  },

  async loginViaEmailPassword(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  },

  async loginWithProvider(provider, redirectPath = '/') {
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}${redirectPath}` },
    });
    if (error) throw error;
  },

  async register({ email, password }) {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
    return { session: data.session };
  },

  async verifyOtp({ email, otpCode }) {
    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token: otpCode,
      type: 'signup',
    });
    if (error) throw error;
    return { access_token: data.session?.access_token };
  },

  async resendOtp(email) {
    const { error } = await supabase.auth.resend({ type: 'signup', email });
    if (error) throw error;
  },

  setToken() {
    // No-op: Supabase manages its own session/token storage internally.
  },

  async resetPasswordRequest(email) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) throw error;
  },

  async resetPassword({ newPassword }) {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
  },

  async logout(redirectUrl) {
    await supabase.auth.signOut();
    if (redirectUrl) window.location.href = '/login';
  },

  redirectToLogin(returnUrl) {
    window.location.href = '/login';
  },
};

const functions = {
  async invoke(name, body) {
    const { data, error } = await supabase.functions.invoke(name, { body });
    if (error) throw error;
    return { data };
  },
};

export const base44 = { entities, auth, functions };
