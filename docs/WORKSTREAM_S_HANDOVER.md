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

## Testing locally

A minimal local stack for Teams (database, sign-in and data API; ports 573xx) lives in the session
scratchpad. The Room's nightly jobs that call production's URL are switched off there.

```
LOCAL_URL=http://127.0.0.1:57321 LOCAL_DB_CONTAINER=supabase_db_teamsstack \
LOCAL_ANON_KEY=… LOCAL_SERVICE_KEY=… deno run -A supabase/tests/local/s0_names_e2e.ts
```

Seed accounts for clicking through: `supabase/tests/local/s_seed_users.ts` (local only).
