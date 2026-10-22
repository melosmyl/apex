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
| `20261016140000_s2_members_and_invitations` | S2 | `company_members` (owner, manager, member; one owner, always one) and `company_invitations` (7 days, one open per person, only a hash of the link's secret); role checks; every company's founder made its owner, and every new company's creator; deleting an account deletes the companies the person owns, refused while others are in one; anonymous visitors never join others' companies |
| `20261016130000_s1_keep_work` | S1 | Company content no longer deleted with the account of the person who made it (companies still go with their founder until S2); `former_members` keeps the name of someone who leaves work behind; `decided_by`, `approved_by_user_id` recorded by the database; `tasks.assignee_user_id`; who made a row can't be changed |

**Renumber at merge time.** Main keeps gaining migrations: on 16 October it already had
`20261017100000_note_withdraw`, numbered after these. Before merging, renumber Teams' migrations
(in order) to come after main's newest and after the workspace's (`20261016110000`–`20261016110800`,
which also need renumbering after main's by then). Check with `supabase db push --dry-run`.

## Before or at deploy

- **Google sign-in returning to a page:** sign-in now sends Google a return address with a path
  (for example `https://justasktheroom.com/company/…/tasks`). In Supabase → Authentication → URL
  configuration, add `https://justasktheroom.com/**` to the redirect allow list (and the `www.`
  form if that serves the app), and check the Site URL's host matches `VITE_SITE_URL`. Otherwise
  Google sign-in lands on the home page instead.
- **For S5 (invites):** the sign-up email's link still goes to the site's home page; invites will
  pass the return path through it (`emailRedirectTo` plus `next=` in the email template).

## Follow-ups owed by later steps

- **S2 (done):** the departing-member check and account deletion now go by ownership.
- **For the admin who deletes accounts by hand:** deleting an account is refused while the person owns a
  company other people belong to. Hand it over or delete the company first.
- **S3:** `prepareAccountabilityChases` writes `assistant_chases.created_by_id = company.created_by_id` (the
  founder); after a founder hands over and deletes their account, that insert fails (the column still links
  to accounts). Chase the task's person instead. Several functions still authorise by
  `companies.created_by_id`; S3 moves them to membership.
- **S3:** `taskRun` should pass `approved_by_user_id: user.id` when it saves an accepted result (the
  database lets the server say who approved).
- **S6:** check `tasks.assignee_user_id` is a member of the task's company before it's used.
- **Names of people who left** are cleared when a company is deleted (which happens nightly, through
  the anonymous clean-up), so a name can outlast its last trace by up to a day. If that needs to be
  tighter, run the same clean-up from a nightly job.
- **Invitations** are deleted 30 days after they're accepted, cancelled or expired (nightly job
  `purge-old-invitations`, plain SQL), and at once when the invited person's account is deleted.
- **Privacy notice:** say that when someone leaves, their name stays on work they did for a company
  (decided by, approved by, made by), until that company's data is deleted.
- **Checked in production (read-only, owner's yes, 16 October 2026):** no row in any of the 13 content
  tables has a creator different from its company's founder, and none is without a company (advisors 91,
  board meetings 39, tasks 84, progress nodes 48 and completions 15, documents 11, progress trees 7,
  task runs 5; projects, decisions, pins, notes and voice sessions empty). S1 changes nothing about who
  existing data belongs to.
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
