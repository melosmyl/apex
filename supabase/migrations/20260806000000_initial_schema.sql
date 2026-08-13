-- ==========================================================================
-- HISTORICAL RECORD — already applied directly via the Supabase SQL Editor
-- before this repo's migrations/ history began (earliest tracked migration
-- is 20260808120000). Confirmed live 2026-08-13: all 17 tables, is_admin(),
-- and the profiles RLS policies already exist in the hosted project.
-- Filed here as a record, not to be re-run — see its own header below,
-- which still says exactly that.
-- ==========================================================================

-- =========================================================================
-- Apex / Advisory — Initial Supabase schema migration
-- Recreates all 17 Base44 entities as Postgres tables with matching RLS.
-- Run this in Supabase: Dashboard → SQL Editor → New query → paste → Run.
-- Safe to run once on a fresh project. Do not re-run without dropping first.
-- =========================================================================

-- ---------------------------------------------------------------------
-- 0. Extensions
-- ---------------------------------------------------------------------
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- 1. Profiles (extends Supabase's built-in auth.users with a role field,
--    mirroring the Base44 "User" entity which only added `role`)
-- ---------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role text not null default 'user' check (role in ('admin', 'user')),
  created_at timestamptz not null default now()
);

-- Auto-create a profile row whenever a new user signs up
create function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;

create policy "profiles_select_own_or_admin"
  on public.profiles for select
  using (
    id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

create policy "profiles_update_own"
  on public.profiles for update
  using (id = auth.uid());

-- Helper: is the current user an admin? Used throughout the policies below.
create function public.is_admin()
returns boolean as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$ language sql security definer stable;

-- ---------------------------------------------------------------------
-- 2. Company
-- ---------------------------------------------------------------------
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  created_by_id uuid not null references auth.users(id) default auth.uid(),
  name text not null,
  logo_url text,
  industry text,
  description text,
  tagline text,
  priorities jsonb default '[]',
  metrics jsonb default '[]',
  advisor_ids jsonb default '[]',
  business_model text,
  stage text check (stage in ('idea_validation','pre_launch','early_revenue','growth','fundraising','product_launch','market_expansion','turnaround')),
  solo_founder text,
  team_size text,
  target_customer text,
  primary_market text,
  available_capital text,
  available_time text,
  existing_assets text,
  current_challenges text,
  immediate_goal text,
  confidence_gaps text,
  advisor_involvement text check (advisor_involvement in ('light','moderate','deep')),
  deadlines text,
  company_type text,
  recommended_journey text check (recommended_journey in ('idea_validation','pre_launch','early_revenue','growth','fundraising','product_launch','market_expansion','turnaround')),
  onboarding_complete boolean default false,
  onboarding_plan jsonb,
  next_milestone text,
  milestone_progress jsonb default '[]',
  last_viewed text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.companies enable row level security;
create policy "companies_owner_or_admin_select" on public.companies for select using (created_by_id = auth.uid() or public.is_admin());
create policy "companies_owner_insert" on public.companies for insert with check (created_by_id = auth.uid());
create policy "companies_owner_or_admin_update" on public.companies for update using (created_by_id = auth.uid() or public.is_admin());
create policy "companies_owner_or_admin_delete" on public.companies for delete using (created_by_id = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------------
-- 3. Advisor
-- ---------------------------------------------------------------------
create table public.advisors (
  id uuid primary key default gen_random_uuid(),
  created_by_id uuid not null references auth.users(id) default auth.uid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  library_key text,
  name text not null,
  role text not null,
  short_bio text,
  biography text,
  expertise jsonb default '[]',
  communication_style text,
  decision_style text,
  strengths jsonb default '[]',
  blind_spots jsonb default '[]',
  weaknesses jsonb default '[]',
  personality_traits jsonb default '[]',
  system_instructions text,
  avatar text,
  accent text,
  is_premium boolean default false,
  default_provider text default 'openai' check (default_provider in ('openai','anthropic')),
  default_model text,
  fallback_provider text check (fallback_provider in ('openai','anthropic')),
  fallback_model text,
  temperature numeric default 0.7,
  maximum_output_length integer default 2000,
  is_active boolean default true,
  version integer default 1,
  type text default 'ai' check (type in ('ai','human')),
  email text,
  voice_name text,
  voice_pitch numeric default 1,
  voice_rate numeric default 0.97,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.advisors enable row level security;
create policy "advisors_owner_or_admin_select" on public.advisors for select using (created_by_id = auth.uid() or public.is_admin());
create policy "advisors_owner_insert" on public.advisors for insert with check (created_by_id = auth.uid());
create policy "advisors_owner_or_admin_update" on public.advisors for update using (created_by_id = auth.uid() or public.is_admin());
create policy "advisors_owner_or_admin_delete" on public.advisors for delete using (created_by_id = auth.uid() or public.is_admin());
create index advisors_company_id_idx on public.advisors(company_id);

-- ---------------------------------------------------------------------
-- 4. Project
-- ---------------------------------------------------------------------
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  created_by_id uuid not null references auth.users(id) default auth.uid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  description text,
  objectives jsonb default '[]',
  timeline text,
  executive_owner text,
  status text default 'planning' check (status in ('planning','active','on_hold','completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.projects enable row level security;
create policy "projects_owner_or_admin_select" on public.projects for select using (created_by_id = auth.uid() or public.is_admin());
create policy "projects_owner_insert" on public.projects for insert with check (created_by_id = auth.uid());
create policy "projects_owner_or_admin_update" on public.projects for update using (created_by_id = auth.uid() or public.is_admin());
create policy "projects_owner_or_admin_delete" on public.projects for delete using (created_by_id = auth.uid() or public.is_admin());
create index projects_company_id_idx on public.projects(company_id);

-- ---------------------------------------------------------------------
-- 5. BoardMeeting (largest entity — discussion data kept as JSONB)
-- ---------------------------------------------------------------------
create table public.board_meetings (
  id uuid primary key default gen_random_uuid(),
  created_by_id uuid not null references auth.users(id) default auth.uid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  question text,
  meeting_mode text default 'board_debate' check (meeting_mode in ('quick_ask','working_session','board_debate','task_request','review','live_conversation')),
  mode_result jsonb,
  participants jsonb default '[]',
  status text default 'preparing' check (status in ('preparing','independent_complete','discussion_complete','challenge_complete','complete','failed')),
  independent_responses jsonb default '[]',
  challenge_responses jsonb default '[]',
  discussion_transcript jsonb default '[]',
  discussion_rounds_completed integer default 0,
  board_resolution jsonb,
  founder_decision text,
  founder_decision_notes text,
  discussion jsonb,
  executive_summary text,
  recommendation text,
  confidence_score numeric,
  risks jsonb default '[]',
  minority_opinion jsonb,
  alternative_strategies jsonb default '[]',
  next_steps jsonb default '[]',
  assigned_tasks jsonb default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.board_meetings enable row level security;
create policy "board_meetings_owner_or_admin_select" on public.board_meetings for select using (created_by_id = auth.uid() or public.is_admin());
create policy "board_meetings_owner_insert" on public.board_meetings for insert with check (created_by_id = auth.uid());
create policy "board_meetings_owner_or_admin_update" on public.board_meetings for update using (created_by_id = auth.uid() or public.is_admin());
create policy "board_meetings_owner_or_admin_delete" on public.board_meetings for delete using (created_by_id = auth.uid() or public.is_admin());
create index board_meetings_company_id_idx on public.board_meetings(company_id);

-- ---------------------------------------------------------------------
-- 6. MeetingMessage
-- ---------------------------------------------------------------------
create table public.meeting_messages (
  id uuid primary key default gen_random_uuid(),
  created_by_id uuid not null references auth.users(id) default auth.uid(),
  meeting_id uuid references public.board_meetings(id) on delete cascade,
  session_id uuid not null,
  company_id uuid references public.companies(id) on delete cascade,
  speaker_type text default 'founder' check (speaker_type in ('founder','human_advisor','ai_advisor','facilitator')),
  speaker_id text,
  speaker_name text,
  message_text text not null,
  sequence_number integer default 0,
  started_at timestamptz,
  completed_at timestamptz,
  was_spoken boolean default false,
  was_interrupted boolean default false,
  response_type text,
  spoken_portion text,
  created_at timestamptz not null default now()
);

alter table public.meeting_messages enable row level security;
create policy "meeting_messages_owner_or_admin_select" on public.meeting_messages for select using (created_by_id = auth.uid() or public.is_admin());
create policy "meeting_messages_owner_insert" on public.meeting_messages for insert with check (created_by_id = auth.uid());
create policy "meeting_messages_owner_or_admin_update" on public.meeting_messages for update using (created_by_id = auth.uid() or public.is_admin());
create policy "meeting_messages_owner_or_admin_delete" on public.meeting_messages for delete using (created_by_id = auth.uid() or public.is_admin());
create index meeting_messages_session_id_idx on public.meeting_messages(session_id);

-- ---------------------------------------------------------------------
-- 7. VoiceMeetingSession
-- ---------------------------------------------------------------------
create table public.voice_meeting_sessions (
  id uuid primary key default gen_random_uuid(),
  created_by_id uuid not null references auth.users(id) default auth.uid(),
  meeting_id uuid references public.board_meetings(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  status text default 'active' check (status in ('active','paused','ended','failed')),
  selected_advisor_ids jsonb default '[]',
  meeting_topic text not null,
  started_at timestamptz,
  ended_at timestamptz,
  current_speaker_id text,
  conversation_mode text default 'auto' check (conversation_mode in ('auto','manual')),
  allow_natural_joining boolean default true,
  audio_enabled boolean default true,
  transcript_status text default 'pending' check (transcript_status in ('pending','complete')),
  meeting_settings jsonb,
  summary jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.voice_meeting_sessions enable row level security;
create policy "vms_owner_or_admin_select" on public.voice_meeting_sessions for select using (created_by_id = auth.uid() or public.is_admin());
create policy "vms_owner_insert" on public.voice_meeting_sessions for insert with check (created_by_id = auth.uid());
create policy "vms_owner_or_admin_update" on public.voice_meeting_sessions for update using (created_by_id = auth.uid() or public.is_admin());
create policy "vms_owner_or_admin_delete" on public.voice_meeting_sessions for delete using (created_by_id = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------------
-- 8. Decision
-- ---------------------------------------------------------------------
create table public.decisions (
  id uuid primary key default gen_random_uuid(),
  created_by_id uuid not null references auth.users(id) default auth.uid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  meeting_id uuid references public.board_meetings(id) on delete set null,
  question text not null,
  participants jsonb default '[]',
  summary text,
  final_recommendation text,
  decision_taken text,
  reasoning text,
  risks jsonb default '[]',
  confidence_level numeric,
  outcome_review text,
  status text default 'pending' check (status in ('pending','decided','reviewed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.decisions enable row level security;
create policy "decisions_owner_or_admin_select" on public.decisions for select using (created_by_id = auth.uid() or public.is_admin());
create policy "decisions_owner_insert" on public.decisions for insert with check (created_by_id = auth.uid());
create policy "decisions_owner_or_admin_update" on public.decisions for update using (created_by_id = auth.uid() or public.is_admin());
create policy "decisions_owner_or_admin_delete" on public.decisions for delete using (created_by_id = auth.uid() or public.is_admin());
create index decisions_company_id_idx on public.decisions(company_id);

-- ---------------------------------------------------------------------
-- 9. Task
-- ---------------------------------------------------------------------
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  created_by_id uuid not null references auth.users(id) default auth.uid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  title text not null,
  description text,
  assigned_to text,
  created_by text,
  status text default 'todo' check (status in ('todo','in_progress','review','done')),
  deliverable text,
  document_id uuid,
  blocker text,
  delegated_back boolean default false,
  start_date date,
  end_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tasks enable row level security;
create policy "tasks_owner_or_admin_select" on public.tasks for select using (created_by_id = auth.uid() or public.is_admin());
create policy "tasks_owner_insert" on public.tasks for insert with check (created_by_id = auth.uid());
create policy "tasks_owner_or_admin_update" on public.tasks for update using (created_by_id = auth.uid() or public.is_admin());
create policy "tasks_owner_or_admin_delete" on public.tasks for delete using (created_by_id = auth.uid() or public.is_admin());
create index tasks_company_id_idx on public.tasks(company_id);
create index tasks_project_id_idx on public.tasks(project_id);

-- ---------------------------------------------------------------------
-- 10. Document
-- ---------------------------------------------------------------------
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  created_by_id uuid not null references auth.users(id) default auth.uid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  task_id uuid references public.tasks(id) on delete set null,
  meeting_id uuid references public.board_meetings(id) on delete set null,
  decision_id uuid references public.decisions(id) on delete set null,
  created_by_advisor_id uuid references public.advisors(id) on delete set null,
  created_by_user_id uuid,
  title text not null,
  description text,
  document_type text default 'Other',
  document_category text,
  folder_path text,
  tags jsonb default '[]',
  status text default 'draft' check (status in ('draft','generating','in_progress','ready_for_review','revision_requested','approved','superseded','archived','failed')),
  content_format text default 'Rich text',
  content text,
  structured_content jsonb,
  file_url text,
  file_name text,
  preview_url text,
  native_file_format text,
  native_file_url text,
  pdf_file_url text,
  template_id text,
  quality_check_status text default 'pending' check (quality_check_status in ('pending','passed','failed')),
  quality_check_results jsonb,
  assumptions_status text default 'needs_confirmation' check (assumptions_status in ('complete','needs_confirmation','missing')),
  source_data_status text default 'estimated' check (source_data_status in ('verified','estimated','missing')),
  file_size numeric,
  source_references jsonb default '[]',
  version_number integer default 1,
  parent_document_id uuid,
  is_latest_version boolean default true,
  approval_status text default 'pending' check (approval_status in ('pending','approved','revision_requested','rejected')),
  approved_by text,
  approved_at timestamptz,
  last_opened_at timestamptz,
  revision_notes text,
  kind text default 'document' check (kind in ('knowledge','document','research')),
  category text default 'Other',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.documents enable row level security;
create policy "documents_owner_or_admin_select" on public.documents for select using (created_by_id = auth.uid() or public.is_admin());
create policy "documents_owner_insert" on public.documents for insert with check (created_by_id = auth.uid());
create policy "documents_owner_or_admin_update" on public.documents for update using (created_by_id = auth.uid() or public.is_admin());
create policy "documents_owner_or_admin_delete" on public.documents for delete using (created_by_id = auth.uid() or public.is_admin());
create index documents_company_id_idx on public.documents(company_id);
create index documents_project_id_idx on public.documents(project_id);

-- ---------------------------------------------------------------------
-- 11. DocumentDownloadLog (create is open to any authenticated user,
--     matching the original Base44 "create": true rule)
-- ---------------------------------------------------------------------
create table public.document_download_logs (
  id uuid primary key default gen_random_uuid(),
  created_by_id uuid not null references auth.users(id) default auth.uid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid,
  file_format text not null,
  version_number integer default 1,
  filename text,
  created_at timestamptz not null default now()
);

alter table public.document_download_logs enable row level security;
create policy "ddl_owner_or_admin_select" on public.document_download_logs for select using (created_by_id = auth.uid() or public.is_admin());
create policy "ddl_anyone_authenticated_insert" on public.document_download_logs for insert with check (auth.uid() is not null);
create policy "ddl_admin_update" on public.document_download_logs for update using (public.is_admin());
create policy "ddl_admin_delete" on public.document_download_logs for delete using (public.is_admin());

-- ---------------------------------------------------------------------
-- 12. Pin
-- ---------------------------------------------------------------------
create table public.pins (
  id uuid primary key default gen_random_uuid(),
  created_by_id uuid not null references auth.users(id) default auth.uid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  meeting_id uuid references public.board_meetings(id) on delete set null,
  decision_id uuid references public.decisions(id) on delete set null,
  document_id uuid references public.documents(id) on delete set null,
  task_id uuid references public.tasks(id) on delete set null,
  advisor_id uuid references public.advisors(id) on delete set null,
  source_type text not null check (source_type in ('board_resolution','executive_discussion','advisor_perspective','challenge_round','research_report','document','decision_memo','meeting_summary','task','project_discussion','ai_conversation')),
  source_id text,
  source_title text,
  source_url text,
  selected_text text not null,
  surrounding_context text,
  pin_title text,
  summary text,
  category text,
  subcategory text,
  themes jsonb default '[]',
  tags jsonb default '[]',
  pin_type text check (pin_type in ('Insight','Idea','Recommendation','Risk','Warning','Assumption','Evidence','Decision','Question','Action','Quote','Lesson')),
  importance text default 'normal' check (importance in ('normal','important','critical')),
  status text default 'active' check (status in ('active','archived')),
  category_confidence numeric,
  related_pin_ids jsonb default '[]',
  created_by text,
  last_opened_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.pins enable row level security;
create policy "pins_owner_or_admin_select" on public.pins for select using (created_by_id = auth.uid() or public.is_admin());
create policy "pins_owner_insert" on public.pins for insert with check (created_by_id = auth.uid());
create policy "pins_owner_or_admin_update" on public.pins for update using (created_by_id = auth.uid() or public.is_admin());
create policy "pins_owner_or_admin_delete" on public.pins for delete using (created_by_id = auth.uid() or public.is_admin());
create index pins_company_id_idx on public.pins(company_id);

-- ---------------------------------------------------------------------
-- 13. Subscription
-- ---------------------------------------------------------------------
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  created_by_id uuid not null references auth.users(id) default auth.uid(),
  user_id uuid,
  company_id uuid not null references public.companies(id) on delete cascade,
  advisor_id uuid not null references public.advisors(id) on delete cascade,
  advisor_name text,
  checkout_id text not null,
  subscription_id text,
  status text default 'pending' check (status in ('pending','active','canceled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.subscriptions enable row level security;
create policy "subscriptions_owner_or_admin_select" on public.subscriptions for select using (created_by_id = auth.uid() or public.is_admin());
create policy "subscriptions_owner_insert" on public.subscriptions for insert with check (created_by_id = auth.uid());
create policy "subscriptions_owner_or_admin_update" on public.subscriptions for update using (created_by_id = auth.uid() or public.is_admin());
create policy "subscriptions_owner_or_admin_delete" on public.subscriptions for delete using (created_by_id = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------------
-- 14. AIModelConfigurations — admin-managed reference data, no per-user
--     ownership in the original schema. Readable by anyone logged in,
--     writable only by admins (and your backend functions via service role).
-- ---------------------------------------------------------------------
create table public.ai_model_configurations (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('openai','anthropic')),
  model_name text not null,
  display_name text not null,
  purpose text,
  is_active boolean default true,
  supports_structured_output boolean default true,
  supports_long_context boolean default false,
  relative_cost_level text default 'medium' check (relative_cost_level in ('low','medium','high')),
  speed_level text default 'medium' check (speed_level in ('slow','medium','fast')),
  quality_level text default 'high' check (quality_level in ('standard','high','premium')),
  last_tested_at timestamptz,
  notes text,
  created_at timestamptz not null default now()
);

alter table public.ai_model_configurations enable row level security;
create policy "amc_authenticated_select" on public.ai_model_configurations for select using (auth.uid() is not null);
create policy "amc_admin_write" on public.ai_model_configurations for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
-- 15. AIUsageLog — internal cost/usage tracking, written by backend
--     functions (service role bypasses RLS), readable by admins only.
-- ---------------------------------------------------------------------
create table public.ai_usage_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  company_id uuid references public.companies(id) on delete set null,
  meeting_id uuid references public.board_meetings(id) on delete set null,
  advisor_id uuid references public.advisors(id) on delete set null,
  provider text not null,
  model text not null,
  request_type text not null,
  input_size numeric,
  output_size numeric,
  estimated_cost numeric,
  latency_ms numeric,
  status text default 'success' check (status in ('success','error','fallback_used')),
  error_code text,
  created_at timestamptz not null default now()
);

alter table public.ai_usage_logs enable row level security;
create policy "aiul_admin_select" on public.ai_usage_logs for select using (public.is_admin());

-- ---------------------------------------------------------------------
-- 16. DeliverableGenerationLog — same pattern as AIUsageLog
-- ---------------------------------------------------------------------
create table public.deliverable_generation_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  company_id uuid not null references public.companies(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete set null,
  advisor_id uuid references public.advisors(id) on delete set null,
  document_id uuid references public.documents(id) on delete set null,
  document_type text not null,
  provider text not null,
  model text not null,
  input_size numeric,
  output_size numeric,
  estimated_cost numeric,
  generation_time numeric,
  export_format text,
  status text default 'success' check (status in ('success','error')),
  error_message text,
  created_at timestamptz not null default now()
);

alter table public.deliverable_generation_logs enable row level security;
create policy "dgl_admin_select" on public.deliverable_generation_logs for select using (public.is_admin());

-- ---------------------------------------------------------------------
-- 17. SystemLimits — single row (or a few, per plan tier) of platform
--     configuration. Readable by everyone logged in, writable by admins.
-- ---------------------------------------------------------------------
create table public.system_limits (
  id uuid primary key default gen_random_uuid(),
  max_meetings_per_month integer default 10,
  max_advisors_per_meeting integer not null default 5,
  min_advisors_per_meeting integer default 3,
  max_context_size integer default 8000,
  max_output_length integer default 2000,
  request_timeout_ms integer default 60000,
  retry_count integer default 1,
  max_discussion_rounds integer default 3,
  created_at timestamptz not null default now()
);

alter table public.system_limits enable row level security;
create policy "sl_authenticated_select" on public.system_limits for select using (auth.uid() is not null);
create policy "sl_admin_write" on public.system_limits for all using (public.is_admin()) with check (public.is_admin());

-- Seed one default row so the app has limits to read from day one.
insert into public.system_limits (max_advisors_per_meeting) values (5);

-- =========================================================================
-- Done. Next: Authentication → Providers (enable Email + Google to match
-- the existing login screen), and Storage → create a "documents" bucket
-- for file uploads (replaces Base44's file storage).
-- =========================================================================
