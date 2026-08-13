# Chairops — prototype-to-production handoff

## What this is
`chairops-dashboard.html` is a working, click-through prototype of the "Now" + most of the
"Next" milestones on the product roadmap: login/app shell, dashboard, waitlist, recalls,
same-day gaps, and treatment-plan cadences. It's a single static HTML file with vanilla JS.
Persistence is a key-value store (`window.storage`, artifact-only) standing in for a real
database. **No backend, auth, PMS, email, or payments are real.** The goal of this doc is to
hand the *data model and interaction logic* to Claude Code so the real app can be built
against a spec instead of a blank page.

## Architecture note (read first)
There is no router — one HTML file, five views (`#view-dashboard`, `#view-waitlist`,
`#view-recalls`, `#view-gaps`, `#view-plans`) toggled by a `hidden` class via `switchView()`.
In the real app these become actual routes: `/app`, `/app/waitlist`, `/app/recall`,
`/app/gaps`, `/app/treatment-plans`, `/app/settings` (settings was never prototyped — still
just a "Next" placeholder in the sidebar).

The one architectural decision worth preserving: **all five screens read and write a shared
`morningBrief` record.** Waitlist confirms, gap fills, recall bookings, and treatment-plan
completions all append an event to the same ledger and update the same counters. This is the
core product bet (coordinated agents, not siloed tools) and it should stay a single source of
truth in the real backend — e.g. one `events` table the dashboard queries, rather than each
feature maintaining its own summary.

## Data model (as prototyped, in storage-key form)

### `session` — personal, not shared
```
{ email: string, practiceName: string }
```
Auth is a stub — any email/password logs in. Real version: real auth (magic link, password,
whatever), practice belongs to an account/org, multi-user per practice eventually.

### `morningBrief` — the shared ledger
```
{
  openSlotsToday: number,
  filled:   [{ type:'fill',  time: string, patient: string, proc: string, manual?: bool }],
  recalled: [{ type:'recall', time: string, patient: string, proc: string, manual?: bool }],
  inbound:  [{ type:'inbound', time: string, patient: string, reason: string }],
  ledger:   [ ...all of the above, plus { type:'treatment', time, patient, proc, manual } ],
}
```
`ledger` is the ordered, all-agent-types feed rendered as the "Overnight ledger" timeline.
`filled` / `recalled` / `inbound` are convenience slices used for the stat cards. Note this is
denormalized on purpose in the prototype (same event lives in two arrays) — in a real schema
this should just be one `events` table with a `type` column, and the stat cards + ledger both
derive from queries against it (`COUNT WHERE type = 'fill' AND date = today`, etc.).

`manual: true` marks events created by a real user action (waitlist confirm, gap confirm,
recall booked, treatment-plan booked) as opposed to the seeded/simulated overnight batch.
This flag exists only because the prototype has a fake "simulate a new night" button that
regenerates mock data — **it has no real-world meaning and should not be carried into
production.** In the real system every event is real; there's no simulated/manual split.

`openSlotsToday` decrements when a gap gets filled. In production this should just be
`schedule slots WHERE status = 'open' AND date = today`.count() — not a stored counter that
can drift.

### `waitlist`
```
[{ id, name, phone, proc, flex, notes, status: 'waiting' | 'offer_sent' | 'confirmed' }]
```
Ordered array = priority order (index 0 = next in line). `proc` and `flex` are free-text in
the prototype (`proc` drawn from a fixed select list — see `GAP_PROCS` / the `<select>` in the
add-patient modal — `flex` is one of "Any time" / "Mornings only" / "Afternoons only"). Real
version needs `proc` to reference an actual procedure-code table, and `flex` is probably a
richer availability structure (day-of-week × time-of-day) rather than three fixed strings.

### `recalls`
```
[{ id, name, phone, category: 'Hygiene'|'Perio'|'Restorative'|'Ortho', dueDate: ISO date, status: 'due' | 'enrolled' | 'booked' }]
```
`category` is currently a fixed enum matching the roadmap's four cadence types. `dueDate` in
production comes from the PMS's recall/next-due-date field, not manual entry. Bulk-enroll only
transitions `due → enrolled`; there's no unenrollment path other than the individual
`resetRecall` action, and there's no real cadence attached to a recall enrollment — that's a
gap between the recalls screen and the treatment-plans screen worth closing in the real build
(right now they're structurally parallel but not connected).

### `gaps`
```
[{ id, time: string, op: string, status: 'booked' | 'open' | 'offer_sent' | 'filled', proc?: string, patientName?: string, waitlistId?: string }]
```
This is meant to represent today's actual schedule (from the PMS). `booked` slots are
non-actionable context; `open` is a real cancellation/gap. `waitlistId` links an offered/filled
gap back to the specific waitlist entry — **this is the join the real schedule sync needs to
preserve**, since it's how a filled gap and a confirmed waitlist patient stay the same record
instead of two disconnected write operations.

Matching logic (`pickWaitlistCandidate`) is intentionally naive: exact string match on `proc`
first, else first person waiting. Production should probably score on procedure match,
availability window vs. slot time, priority, and maybe distance/notice-time constraints — this
prototype's version is a placeholder for that logic, not a spec for it.

### `cadenceTemplates`
```
{ [templateType: string]: [{ id, offsetDays: number, label: string }, ...] }
```
One entry per procedure type (`Crown`, `Implant`, `Ortho case`, `Whitening` — hardcoded list,
see `PLAN_TYPES`). Steps are just a day-offset and a human-readable label — there's no actual
message content, channel (email vs. text), or send logic. Production needs to add: message
body/template per step, channel, and the actual scheduled-send mechanism (this is where the
platform email/SMS proxy and a real job scheduler come in).

### `treatmentPlans`
```
[{ id, patientName, templateType, stepIndex: number, status: 'warming' | 'completed' }]
```
`stepIndex` is advanced manually via a button in the prototype ("Advance stage"). In
production this should advance automatically based on `offsetDays` elapsed since enrollment,
firing the actual outreach at each step — the manual button is standing in for what should be
a cron/scheduled-job process.

## Screens (UI behavior worth preserving)

| Screen | Route | Core interaction |
|---|---|---|
| Login/signup | `/login` | Email+password, practice name on signup. Trivial to replace with real auth. |
| Dashboard | `/app` | Greeting + one-line summary, 5 stat cards, overnight ledger (color-coded by agent), "needs a human" queue, warming-plans panel. Reads `morningBrief` + `treatmentPlans`. |
| Waitlist | `/app/waitlist` | Priority-ordered list, add-patient modal, send fill offer → confirm/return-to-waitlist. Confirm writes to `morningBrief`. |
| Recalls | `/app/recall` | Category tabs + due-date filter, checkbox multi-select, bulk "enroll in cadence," individual "mark booked" (writes to `morningBrief`). |
| Same-day gaps | `/app/gaps` | Today's schedule, open slots get "send fill offer" which auto-matches a waitlist patient, confirm/cancel. Confirm writes to `morningBrief` **and** updates the linked `waitlist` entry. |
| Treatment plans | `/app/treatment-plans` | Per-procedure-type cadence editor (add/reorder/remove steps) + patient list with stage tracking. "Mark booked" writes to `morningBrief`. |
| Settings | `/app/settings` | Never built. Sidebar placeholder only. |

Color system used throughout (worth keeping for visual continuity if useful, not load-bearing):
ink navy `#1B2333` for chrome, warm gold `#C98A2E` for waitlist/fill events, sage `#4F7A5A` for
recall events, muted brick red `#B54A3F` reserved only for "needs a human," slate for
treatment-plan events. Fraunces for the dashboard greeting, IBM Plex Sans for UI, IBM Plex Mono
for timestamps/data.

## What's explicitly NOT in this prototype
- Real auth, multi-user accounts, or practice-level permissions
- Any PMS integration (Dentrix/Eaglesoft/Open Dental/tab32) — all schedule/patient data is
  hand-seeded
- Real email/SMS sending — "send fill offer" and cadence steps are simulated, no message
  content exists
- The 7am scheduled brief email (needs a real cron/job scheduler)
- Stripe Connect / billing
- Settings page
- Insurance/eligibility logic anywhere
- Any server-side validation — everything here is client-side and trusts its own inputs

## Market strategy: UK-first, US-ready

**Decision:** build and sell in the UK first. The founder is UK-based, the UK market is
less saturated than the US one, and the core product concept (coordinated agents, not a
single receptionist bot) doesn't need to change per country — only a few specific things do.
Structure the app so those things are configuration, not a fork.

### What varies by market (make these config, not hardcoded)
- **PMS integration** — UK: Dentally first (modern, API-first, easiest to integrate),
  Software of Excellence/EXACT second (legacy incumbent, more complex, still common in
  NHS-heavy practices). Carestream, CareStack, Semble, Aerona also have real UK share.
  US: Dentrix, Eaglesoft, Open Dental, tab32 (per original research) — lower priority now,
  revisit once UK is proven.
- **Compliance document** — UK: Data Processing Agreement (DPA) + ICO registration, not a
  BAA. No external certification required by law (DSPT only applies if a practice holds an
  NHS contract — private-only practices don't need it). US: BAA + HIPAA, as originally
  planned.
- **Currency/pricing display** — GBP for UK practices, USD for US practices. Same
  £/$200–600-equivalent tier structure works in both markets based on current research;
  no need to redesign pricing, just the display currency and copy.
- **Messaging compliance framing** — UK: PECR governs SMS/email. Appointment reminders,
  recall nudges, and fill-offer texts are service/transactional messages under PECR (not
  marketing) as long as they stay factual — no discount or upsell language — so they don't
  need the stricter opt-in consent a marketing text would. Worth building the messaging
  templates to stay factual by default so this stays true. US: TCPA governs SMS consent
  instead — different rule, same practical need to capture consent before texting.

### Practical implementation note
Add a `region` (or `country`) field to the practice record. It should determine: which PMS
adapters are offered in onboarding, which compliance doc template gets shown/signed, and
which currency the pricing/settings screens display. This is a normal multi-region SaaS
pattern — worth setting up now, even while only selling in the UK, so US expansion later is
a config addition rather than a rebuild.

### Future-ready regions: Norway, Denmark, Finland (structural only — not legally ready)
Opus Dental is also the dominant PMS in Norway, Denmark, and Finland, so the adapter built
for Sweden covers these three technically at near-zero extra cost. Add them to the `region`
enum and currency list now so the schema never needs to change later — but do **not** treat
their compliance docs as real, signed-off legal documents. Mark them explicitly as
placeholders pending real legal review, because inventing plausible-sounding compliance
copy for a country nobody has actually researched is worse than having none — it creates
false confidence.

- **Norway (`NO`)** — not an EU member (EEA instead), but GDPR applies via the EEA
  agreement. National law: Personal Data Act (Personopplysningsloven). Regulator:
  Datatilsynet (Norway's version — note Denmark's regulator has the *same name*, they are
  not the same body). Healthcare-specific: the Patient Record Act. Currency: NOK.
- **Denmark (`DK`)** — EU member. GDPR + the Danish Data Protection Act
  (Databeskyttelsesloven). Regulator: Datatilsynet (Denmark's version). Currency: DKK
  (Denmark is not in the eurozone).
- **Finland (`FI`)** — EU member. GDPR + Finland's Data Protection Act. Regulator: the
  Office of the Data Protection Ombudsman (Tietosuojavaltuutetun toimisto). Currency: EUR
  (Finland is in the eurozone, unlike its Nordic neighbours).

**Do this now:** add `NO`/`DK`/`FI` as selectable region values, wire them to the same Opus
Dental adapter, add NOK/DKK/EUR as currency options.
**Do not do this now:** do not generate DPA/compliance document text for these three and
present it as usable — flag it clearly in the UI/code as "compliance review pending" if a
practice from one of these regions is ever selected, until real local legal input exists.

### Immediate priority order (revised)
Build all three region configs now, structurally — don't defer any to "later." The
distinction that matters is: **the app should be multi-market-ready from day one**, while
**sales/go-to-market focus stays UK-first** (fewer relationships to learn, one country's
rules to internalize first). Those are separate decisions — build for all three, sell into
one first.

1. `region` field on the practice record, selectable at signup (`UK` / `US` / `SE` to
   start — structured so more can be added later without a schema change)
2. PMS adapter pattern with three adapters wired from the start, same interface:
   - Dentally (UK)
   - Dentrix (US)
   - Opus Dental (SE — also the dominant PMS in Norway/Denmark/Finland, so this adapter
     is worth more than just the Swedish market if Nordic expansion ever comes up)
3. Compliance doc template keyed by region:
   - UK: DPA + ICO registration (UK GDPR)
   - US: BAA + HIPAA
   - SE: DPA + IMY (EU GDPR directly, plus Sweden's Dataskyddslagen and the
     healthcare-specific Patientdatalagen) — this can reuse most of the UK DPA's structure
     since both are GDPR-family, with a Sweden-specific clause referencing Patientdatalagen
     and IMY rather than the ICO
4. Currency stored/displayed per region (GBP/USD/SEK) on pricing and settings screens
5. Messaging templates written to satisfy the strictest common denominator across all
   three rulesets by default (factual, no discount/upsell language) so the same copy is
   safe under PECR (UK), TCPA (US), and LEK (Sweden) without needing three separate
   template sets
6. Note for sales targeting: in Sweden, the addressable market is private practices
   (privattandläkare), not Folktandvården (the public dental service) — different
   procurement process entirely, same distinction as targeting private vs. NHS practices
   in the UK
7. Everything else in the build order below is unchanged

## Suggested build order for Claude Code
1. Real auth + practice/account model
2. `events` table replacing the `morningBrief` blob (fill/recall/inbound/treatment as rows,
   not arrays)
3. Waitlist + recalls + gaps as real tables, port the interaction logic above 1:1 — it's
   already been through a few iterations of wiring and shouldn't need re-thinking, just
   re-platforming
4. Treatment-plan cadences with a real scheduler advancing `stepIndex` and actually sending
   the step's message via the platform email/SMS proxy
5. PMS integration behind the same `gaps`/`waitlist`/`recalls` shapes, once you have a
   production PMS account to connect
6. 7am cron brief email, Stripe checkout, settings page
