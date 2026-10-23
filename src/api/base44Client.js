import { createClient } from '@supabase/supabase-js';
import { SITE_URL } from '@/lib/branding';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// The three requests the first screen waits on get a time limit (owner, 23
// October 2026): Safari sometimes leaves a request unanswered rather than
// failing it, and one that hung left the spinner up for good. A request past
// the limit is abandoned like a failed one, and the Supabase library retries
// a sign-in refresh by itself. Only these three: signing up, password resets
// and email changes can take longer and do their work on the server whether
// or not we wait, so they're never cut short; nor are meetings, exports or
// saves.
export const SIGN_IN_REQUEST_LIMIT_MS = 10_000;
const isStartupRequest = (url, method) =>
  (url.includes('/auth/v1/token') && url.includes('grant_type=refresh_token'))
  || (url.includes('/auth/v1/user') && (!method || method.toUpperCase() === 'GET'))
  || url.includes('/rest/v1/rpc/get_my_profile');
function fetchWithLimit(input, init = {}) {
  const url = typeof input === 'string' ? input : input?.url || String(input);
  const method = init.method || (typeof input === 'object' ? input?.method : undefined);
  if (!isStartupRequest(url, method) || typeof AbortSignal?.timeout !== 'function') return fetch(input, init);
  const limit = AbortSignal.timeout(SIGN_IN_REQUEST_LIMIT_MS);
  const signal = init.signal && typeof AbortSignal.any === 'function' ? AbortSignal.any([init.signal, limit]) : init.signal || limit;
  return fetch(input, { ...init, signal });
}

export const supabase = createClient(supabaseUrl, supabaseKey, { global: { fetch: fetchWithLimit } });

const TABLES = {
  Company: 'companies',
  Advisor: 'advisors',
  Project: 'projects',
  BoardMeeting: 'board_meetings',
  MeetingMessage: 'meeting_messages',
  Decision: 'decisions',
  Task: 'tasks',
  TaskRun: 'task_runs',
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

// A request that never got an answer (no connection, or past its time limit)
// isn't the same as "not signed in": the app says it couldn't reach the
// server instead of showing a signed-in person the logged-out home page.
// A server error (5xx) counts too: the server didn't say "not signed in".
const noAnswer = (error, status) => error?.name === 'AuthRetryableFetchError'
  || Number(status ?? error?.status) === 0 || Number(status ?? error?.status) >= 500
  || /failed to fetch|fetch failed|network|load failed|abort|timeout|timed out/i.test(`${error?.name || ''} ${error?.message || ''}`);
const unreachable = () => Object.assign(new Error("Couldn't reach the server"), { unreachable: true });

async function fetchProfile(authUser) {
  const { data: profile, error, status } = await supabase.rpc('get_my_profile');
  if (error) throw noAnswer(error, status) ? unreachable() : error;
  return {
    id: authUser.id,
    email: authUser.email,
    role: profile?.role || 'user',
    // The name other people in a company see (Workstream S); null until set.
    displayName: profile?.display_name || null,
    isAnonymous: !!authUser.is_anonymous,
  };
}

const auth = {
  async me() {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error && noAnswer(error)) throw unreachable();
    if (error || !user) {
      const err = new Error('Not authenticated');
      err.status = 401;
      throw err;
    }
    return fetchProfile(user);
  },

  // captchaToken: Supabase Auth has captcha protection on, so password
  // login, signup, resend and recover all need a Turnstile token (see
  // useCaptcha in lib/turnstile.js).
  async loginViaEmailPassword(email, password, captchaToken) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
      options: { captchaToken },
    });
    if (error) throw error;
    return data;
  },

  async loginWithProvider(provider, redirectPath = '/') {
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${SITE_URL}${redirectPath}` },
    });
    if (error) throw error;
  },

  // Signup verifies with a 6-digit code, but emailRedirectTo still decides
  // where any link in the confirmation email lands — without it Supabase
  // falls back to the dashboard Site URL.
  async register({ email, password, captchaToken }) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${SITE_URL}/`, captchaToken },
    });
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

  async resendOtp(email, captchaToken) {
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: `${SITE_URL}/`, captchaToken },
    });
    if (error) throw error;
  },

  setToken() {
    // No-op: Supabase manages its own session/token storage internally.
  },

  async resetPasswordRequest(email, captchaToken) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${SITE_URL}/reset-password`,
      captchaToken,
    });
    if (error) throw error;
  },

  async resetPassword({ newPassword }) {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
  },

  // Your own display name, through the one function that may change it.
  async setDisplayName(name) {
    const { data, error } = await supabase.rpc('set_my_display_name', { p_name: name });
    if (error) throw error;
    return data?.display_name ?? null;
  },

  // Signs out this browser only (not your other devices). If Supabase can't
  // be reached, the session is still removed here, so "signed out" is true.
  async logout(redirectUrl) {
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) {
      for (const k of Object.keys(localStorage)) if (/^sb-.*-auth-token$/.test(k)) localStorage.removeItem(k);
    }
    if (redirectUrl) window.location.href = '/login';
  },

  // Sign in, then come back here: only a same-origin path is passed on
  // (and Login checks it again with safeReturnTo).
  redirectToLogin(returnUrl) {
    let path = '/';
    try {
      const url = new URL(returnUrl || '/', window.location.origin);
      if (url.origin === window.location.origin) path = url.pathname + url.search;
    } catch { /* keep "/" */ }
    window.location.href = path === '/' ? '/login' : `/login?returnTo=${encodeURIComponent(path)}`;
  },
};

const functions = {
  async invoke(name, body) {
    const { data, error } = await supabase.functions.invoke(name, { body });
    if (error) {
      // supabase-js puts the raw Response on error.context; callers read the
      // server's message from error.response.data.error (the Base44 shape).
      const res = error.context;
      if (res && typeof res.json === "function") {
        try {
          const payload = await res.json();
          error.response = { status: res.status, data: payload };
          if (payload?.error) error.message = payload.error;
        } catch { /* not JSON — keep supabase-js's message */ }
      }
      throw error;
    }
    return { data };
  },
};

export const base44 = { entities, auth, functions };
