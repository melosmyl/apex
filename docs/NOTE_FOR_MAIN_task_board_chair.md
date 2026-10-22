# For the main session: two Chair changes for the task board (Workstream T)

Written 22 October 2026 by the People and Growth session (branch `workstream-t/task-board`). The task
board itself is built there; these two changes are in the Chair's code, which is the main session's, so
they're described here rather than made. Both need the task board's migration
(`20261022100000_t_task_board.sql`, renumbered at merge) to be in main first, and they use
`supabase/functions/_shared/shortTitle.ts` from the same branch.

## What the task board does without them

- Every task has a `department` (product, marketing, sales, finance, legal, ops). When a task is made
  without one, a database trigger gives it the owning advisor's home department, and Ops when there's
  no advisor. So today every one of the Chair's actions that the founder owns lands in **Ops**.
- A task with more than seven words is marked `short_title_pending`; the board then asks
  `shortenTaskTitles` (cheap tier) for its short title, and shows the full wording until it arrives.
  So every Chair action costs one share of a small cheap call, a moment after the meeting.

## Change 1: the Chair writes each action's short title

Owner's decision (plan, 15 October; confirmed 22 October): the Chair writes them as part of its answer,
at no extra cost.

- In the resolution schema's `priority_actions` items, add
  `short_title: { type: 'string', description: 'This action in 7 words or fewer, starting with the verb, keeping its one specific thing (a name, a number, a place). No full stop.' }`
  and make it required alongside `title`.
- In `runChairSynthesis`, where the task rows are built from `priorityActions` (about line 468 on main
  `0112a11`), add `short_title: cleanShortTitle(a.short_title)` (import it from
  `../_shared/shortTitle.ts`). `cleanShortTitle` returns null for anything over seven words or 80
  characters, and the trigger then marks the task as waiting, so a bad short title costs nothing more
  than today.
- `title` stays the full wording: `MeetingResult` pairs actions with tasks by that exact text.
- `normalizeResults`/repair: keep `short_title` with its action, or drop it, wherever actions are
  rewritten. If an action's wording is repaired, its short title should be rewritten or dropped too.

## Change 2: the Chair picks the department for the founder's own actions

Owner's decision 2 (22 October): an action no advisor owns goes where the work belongs ("call the
market organiser" is Sales), not to Ops.

- In `priority_actions` items, add
  `department: { type: 'string', enum: ['product', 'marketing', 'sales', 'finance', 'legal', 'ops'], description: 'Which part of the business this work belongs to. Only used when the founder does it.' }`.
- In the task rows: `...(a.advisor_id ? {} : { department: DEPARTMENTS.has(a.department) ? a.department : 'ops' })`.
  When an advisor owns the action, leave `department` out: the trigger gives it that advisor's home
  department, which is what the owner chose.
- The prompt can say it in one line: for an action the founder does, choose the department the work
  belongs to.

## Tests

- Unit: the task rows carry `short_title` (cleaned) and, for founder actions only, a valid
  `department`.
- Local e2e (fake providers, `fields` override): a meeting whose actions include one founder action
  with `department: 'sales'` and one advisor action; the saved tasks are Sales and the advisor's home
  department, with `short_title` set and `short_title_pending` false.
