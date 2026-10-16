# Workstream S (Teams): running notes for the handover

Started 16 October 2026 on branch `workstream-s/teams` (from main at `e63d21c`) in the worktree
`~/Documents/apex-workspace`. The plan: https://claude.ai/artifact/91eeDs86Nzvyh7c6znxqjw.
Owner decisions of 16 October: all 15 as recommended; S0, S1 and S2 now; S3 onwards after
Workstreams P and T have merged into main.

**Nothing here has touched production.** Each production step needs the owner's yes in their own words.

## Migrations so far

| Migration | Step | What |
|---|---|---|
| `20261016120000_s0_display_names` | S0 | A display name on profiles; set only through `set_my_display_name()`; filled from a name given at sign-up (Google) |
| `20261016130000_s1_keep_work` | S1 | Company content no longer deleted with the account of the person who made it (companies still go with their founder until S2); `former_members` keeps the name of someone who leaves work behind; `decided_by`, `approved_by_user_id` recorded by the database; `tasks.assignee_user_id`; who made a row can't be changed |

At merge time, check that these still come after main's newest migration, and after the
workspace's (`20261016110000`–`20261016110800`); renumber if not.

## Before or at deploy

- **Google sign-in returning to a page:** sign-in now sends Google a return address with a path
  (for example `https://justasktheroom.com/company/…/tasks`). In Supabase → Authentication → URL
  configuration, add `https://justasktheroom.com/**` to the redirect allow list (and the `www.`
  form if that serves the app), and check the Site URL's host matches `VITE_SITE_URL`. Otherwise
  Google sign-in lands on the home page instead.
- **For S5 (invites):** the sign-up email's link still goes to the site's home page; invites will
  pass the return path through it (`emailRedirectTo` plus `next=` in the email template).

## Follow-ups owed by later steps

- **S2:** `remember_departing_member` decides "a company that isn't theirs" by `companies.created_by_id`;
  rewrite it for membership (owner role), and replace the companies' account cascade with an
  explicit "delete companies this person solely owns" step.
- **S3:** `taskRun` should pass `approved_by_user_id: user.id` when it saves an accepted result (the
  database lets the server say who approved).
- **S6:** check `tasks.assignee_user_id` is a member of the task's company before it's used.
- **Names of people who left** are cleared when a company is deleted (which happens nightly, through
  the anonymous clean-up), so a name can outlast its last trace by up to a day. If that needs to be
  tighter, run the same clean-up from a nightly job.
- **Privacy notice:** say that when someone leaves, their name stays on work they did for a company
  (decided by, approved by, made by), until that company's data is deleted.
- **Optional, with the owner's yes:** a read-only count in production of rows whose creator differs
  from their company's creator (from Base44 imports or admin edits); such rows now outlive the
  creator's account.
- **Unrelated, found in review:** `src/components/documents/DocumentManager.jsx:109` writes
  `"founder"` into a uuid column, so adding a document there fails (main session).

## Testing locally

A minimal local stack for Teams (database, sign-in and data API; ports 573xx) lives in the session
scratchpad. The Room's nightly jobs that call production's URL are switched off there.

```
LOCAL_URL=http://127.0.0.1:57321 LOCAL_DB_CONTAINER=supabase_db_teamsstack \
LOCAL_ANON_KEY=… LOCAL_SERVICE_KEY=… deno run -A supabase/tests/local/s0_names_e2e.ts
```

Seed accounts for clicking through: `supabase/tests/local/s_seed_users.ts` (local only).
