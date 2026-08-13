# Apex — Handoff Briefing for Claude Code

Context: this project was migrated off Base44 (whose deploy pipeline was confirmed broken) onto Vercel + Supabase, through a long back-and-forth in Claude chat where the user could only paste code into browser UIs. That's why some of this was deployed by hand rather than committed to git. Read this fully before making changes.

## Infrastructure

- **GitHub:** `melosmyl/apex`, branch `main` — this is the source of truth for frontend code.
- **Hosting:** Vercel project `apex` (under team "League"), live at `apex-seven-umber.vercel.app`. Auto-deploys on push to `main`. `vercel.json` already has the SPA rewrite rule needed for client-side routing.
- **Backend:** Supabase project `apex`, URL `https://bqqcobaspbkyofupmhfe.supabase.co`. Auth (email/password, email confirmation currently OFF for easier testing), Postgres database (17 tables + `profiles`), and Edge Functions all live here.
- **Vercel env vars set:** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. (Also two unused leftover vars, `VITE_BASE44_APP_ID` / `VITE_BASE44_APP_BASE_URL` — safe to delete once confirmed nothing references them.)
- **Supabase Edge Function secrets set:** `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`.

## Architecture pattern — read this before touching anything

`src/api/base44Client.js` is a compatibility shim. ~40 frontend files still call `base44.entities.X.list()`, `base44.auth.me()`, `base44.functions.invoke(name, payload)` — the exact same calls that used to hit Base44's SDK. Rather than rewriting all 40 files, that one file now implements the same interface on top of Supabase. **Keep using this pattern** — any new entity or function should be added to the mapping in that file, not by rewriting call sites.

Table names are `snake_case` plural (e.g. `Company` → `companies`, `BoardMeeting` → `board_meetings`) — see the `TABLES` map in `base44Client.js` for the full list.

## Edge Functions — status

**Deployed and confirmed working** (via Supabase's browser editor, not yet committed to git):
- `testAdvisor` — lets an admin test one advisor with one question. Confirmed working end to end with real OpenAI calls.
- `adminApi` — backs the `/admin` page (list advisors, usage logs, system limits).

**Written and ready to deploy, sitting in the attached zip, never yet deployed anywhere:**
- `routeAdvisorRequest` — the shared "ask one advisor a question" engine. The other three call into this one via HTTP fetch using the service-role key as an internal auth token (not called directly by the frontend).
- `startBoardMeeting` — creates a `board_meetings` row, gathers company context, runs the independent-response round in parallel across selected advisors.
- `runBoardDiscussion` — runs the multi-round challenge/debate phase (up to `system_limits.max_discussion_rounds`), with real "truth over harmony" prompting — advisors are explicitly instructed to disagree and defend positions, not just agree.
- `runChairSynthesis` — the final round: a "Chair" advisor persona weighs the whole discussion and produces the board resolution.

**Deploy these 4 in this order** (`routeAdvisorRequest` first, it's a dependency of the other three), matching the exact function names above. **Important gotcha:** each function does its own manual auth check in code (checking the caller's JWT or, for `routeAdvisorRequest`, the service-role key) — so **"Enforce JWT Verification" must be turned OFF** in each function's Settings tab in the Supabase dashboard, or Supabase's platform-level check will reject requests before your code ever runs. This bit us during testing — don't skip it.

**Not yet ported at all** (still only exists as Base44 Deno functions in `base44/functions/`, needs the same treatment): `runFounderFollowup`, `generate-deliverable` (+ its shared builders in `base44/shared/`), `getDocumentDownloadUrl`, `analyzePin`, `runLiveBoardroomTurn`, `endLiveBoardroom`, `create-checkout`, `cancel-subscription`, `wix-payments-webhook`.

## After the 4 functions are deployed and committed

Test the full loop through the actual app: log in, create a company if needed, add 3+ advisors, go to the Boardroom, run a Board Debate. This exercises `startBoardMeeting` → `runBoardDiscussion` → `runChairSynthesis` together for the first time.

## Known product/design backlog (from a full codebase audit — see the attached `APEX_AUDIT.md` for full detail)

In priority order, once the above works:
1. **Redesign the Boardroom flow** — currently: 6 modes to choose from before asking anything, then a static "please wait" spinner during the whole multi-round discussion with no visibility into it. Worth collapsing the mode choice and showing the debate build live/incrementally rather than as a single batch result.
2. **Fix document branding** — `base44/shared/buildDocxReport.ts` still hardcodes the *old* cream/tan color palette (`#7A5C3E`, `#E8E2D8`) and generic Calibri font. Never updated when the site's visual identity was redesigned. Same likely true of `buildPptxDeck.ts`, `buildExcelModel.ts`, `buildPdfReport.ts` — worth checking all four.
3. **Board memory** — advisors currently start fresh each meeting with only a short company blurb; no persistent memory of past decisions/discussions feeding into new ones beyond a shallow "last 5 items" context pull. This was a core piece of the original product vision and still isn't built.
4. Smaller items: thin gamification (Time Saved / Momentum widgets), two coexisting payment systems (Stripe + a Wix webhook, never reconciled), large document-type taxonomy that's probably more categories than needed.

## Design system reference

Fonts: Space Grotesk (headings), Inter (body), IBM Plex Mono (labels/data). Light theme: paper-white background (`40 14% 96%` in HSL), near-black foreground, signal-amber accent (`43 75% 40%`), sharp corners (6px base radius), faint blueprint-grid texture on page backgrounds. Full tokens in `src/index.css`. Keep any new UI consistent with this — the whole point of the redesign was moving away from generic "AI-generated" cream/serif defaults.
