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

function unwrap({ data, error }) {
  if (error) throw error;
  return data;
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
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', authUser.id)
    .single();
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

export const base44 = { entities, auth };
