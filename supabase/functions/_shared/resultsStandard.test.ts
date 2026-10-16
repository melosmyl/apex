import { assert, assertEquals } from 'jsr:@std/assert@1';
import { isVague, mergeRepair, normalizeResults, plainMissingInfo, vagueParts, withoutFieldKeys } from './resultsStandard.ts';

const board = [
  { id: 'c', name: 'Margaret Ashford', role: 'The Chair', library_key: 'chair', type: 'ai', company_id: 'co' },
  { id: 'g', name: 'Grace Okafor', role: 'Customer Advocate', type: 'ai', company_id: 'co' },
  { id: 'm', name: 'Marcus Webb', role: 'Finance Director', type: 'ai', company_id: 'co' },
];

Deno.test('categories of advice are vague; named, numbered work is not', () => {
  for (const t of ['Validate demand', 'Explore your options', 'Conduct market research', 'Refine your positioning',
    'Think about pricing', 'Build awareness on social media', 'Gather feedback', 'Review the strategy', 'Consider whether to hire'])
    assertEquals(isVague(t), true, t);
  for (const t of ['Call the six people who enquired last month and ask what stopped them',
    'Research three UK suppliers of refurbished Barbour jackets', 'Email Sarah the revised quote',
    'Draft a 150-word listing for the winter coats', 'Review Q3 invoices with your accountant',
    'Ask your landlord in writing whether the break clause applies',
    // From the second check: anchored by a number, a name or quoted wording.
    'Email the 6 stockists and ask them to consider the £45 price', 'Gather feedback from the 12 customers who bought in March',
    'Validate demand with a £50 Instagram ad to 2,000 people', 'Do due diligence on Acme Ltd at Companies House',
    'Leverage your 3,000 Instagram followers by posting the pre-order link',
    'Ask your accountant to think about VAT registration before you pass £90k'])
    assertEquals(isVague(t), false, t);
  // An apostrophe isn't quoted wording.
  assertEquals(isVague("Review your company's pricing"), true);
  assertEquals(isVague(''), false);
});

Deno.test('vagueParts names each vague action and fix', () => {
  const parts = vagueParts({
    priority_actions: [{ title: 'Validate demand' }, { title: 'Email Sarah the quote' }],
    top_issues: [{ problem: 'p', fix: 'Explore options' }, { problem: 'q', fix: 'Raise the price to £45 for new customers' }],
  });
  assertEquals(parts, ['action 1: "Validate demand"', 'issue 1\'s fix: "Explore options"']);
});

Deno.test('lists are capped and owners resolve to real advisors or the founder', () => {
  const r = normalizeResults({
    verdict: '  Go, but test the price first.  ',
    priority_actions: [
      { title: 'Ring three stockists', assigned_to: 'Grace Okafor', task_type: 'research', brief: 'b', done_when: 'd', why_first: 'w' },
      { title: 'Sign the lease extension', assigned_to: 'Founder', task_type: 'draft', brief: '', done_when: '', why_first: '' },
      { title: 'Work out the margin at £45', assigned_to: 'the finance director', task_type: 'calculate', brief: '', done_when: '', why_first: '' },
      { title: 'Fourth action', assigned_to: 'Founder', task_type: 'plan', brief: '', done_when: '', why_first: '' },
      { title: '', assigned_to: 'Founder', task_type: 'plan' },
    ],
    top_issues: Array.from({ length: 7 }, (_, i) => ({ problem: `p${i}`, why_it_matters: 'w', fix: 'f' })),
    founder_questions: ['Q1?', '', 'Q2?', 'Q3?', 'Q4?', 'Q5?'],
    disagreements: ['a', 'b', 'c', 'd'],
  }, board);
  assertEquals(r.verdict, 'Go, but test the price first.');
  assertEquals(r.priority_actions.length, 3);
  assertEquals(r.priority_actions[0].advisor_id, 'g');
  assertEquals(r.priority_actions[0].task_type, 'research');
  // The founder's own work has no task type: nothing for an advisor to do.
  assertEquals(r.priority_actions[1].assigned_to, 'Founder');
  assertEquals(r.priority_actions[1].task_type, null);
  assertEquals(r.priority_actions[1].advisor_id, null);
  assertEquals(r.priority_actions[2].advisor_id, 'm');
  assertEquals(r.top_issues.length, 5);
  assertEquals(r.founder_questions, ['Q1?', 'Q2?', 'Q3?', 'Q4?']);
  assertEquals(r.disagreements.length, 3);
});

Deno.test("the founder's own work stays theirs, and an unknown name is never guessed", () => {
  const r = normalizeResults({ priority_actions: [
    { title: 'Ring the bank', assigned_to: 'You', task_type: 'research' },
    { title: 'Ring the bank', assigned_to: 'the founder', task_type: 'draft' },
    { title: 'Ring the bank', assigned_to: 'Grace Okafor', task_type: 'founder' },
    { title: 'Ring the bank', assigned_to: 'Maya', task_type: 'research' },
    { title: 'Ring the bank', assigned_to: 'Grace', task_type: 'draft' },
  ] }, board);
  // Lists are capped at 3, so check the first three, then the rest separately.
  for (const a of r.priority_actions) assertEquals([a.assigned_to, a.advisor_id, a.task_type], ['Founder', null, null]);
  const more = normalizeResults({ priority_actions: [
    { title: 'Ring the bank', assigned_to: 'Maya', task_type: 'research' },
    { title: 'Ring the bank', assigned_to: 'Grace', task_type: 'draft' },
  ] }, board);
  assertEquals(more.priority_actions[0].advisor_id, null);
  assertEquals(more.priority_actions[1].advisor_id, 'g');
});

Deno.test('an unknown task type is dropped, not guessed', () => {
  const r = normalizeResults({ priority_actions: [{ title: 'Ring Grace', assigned_to: 'Grace Okafor', task_type: 'invoice' }] }, board);
  assertEquals(r.priority_actions[0].task_type, null);
  assertEquals(r.priority_actions[0].advisor_id, 'g');
});

Deno.test('a repair rewords only the flagged items, by number, and keeps owners', () => {
  const r = {
    priority_actions: [
      { title: 'Email Sarah the quote', assigned_to: 'Founder', advisor_id: null, task_type: null, brief: '', done_when: 'sent', why_first: '' },
      { title: 'Validate demand', assigned_to: 'Grace Okafor', advisor_id: 'g', task_type: 'research', brief: 'old', done_when: 'old', why_first: 'w' },
    ],
    top_issues: [{ problem: 'p', why_it_matters: 'w', fix: 'Explore options' }, { problem: 'q', why_it_matters: 'w', fix: 'Raise the price to £45' }],
  };
  // A repair that answers with only the reworded item, plus one it wasn't asked about.
  mergeRepair(r, {
    actions: [
      { number: 2, title: 'Ask the 6 people who enquired last month what stopped them', brief: 'new', done_when: '' },
      { number: 1, title: 'Should not change', brief: 'x', done_when: 'x' },
    ],
    fixes: [{ number: 1, fix: 'Offer two price points to the next 20 customers' }, { number: 2, fix: 'Should not change' }],
  });
  assertEquals(r.priority_actions[0].title, 'Email Sarah the quote');
  assertEquals(r.priority_actions[1].title, 'Ask the 6 people who enquired last month what stopped them');
  assertEquals([r.priority_actions[1].advisor_id, r.priority_actions[1].task_type, r.priority_actions[1].brief, r.priority_actions[1].done_when], ['g', 'research', 'new', 'old']);
  assertEquals(r.top_issues[0].fix, 'Offer two price points to the next 20 customers');
  assertEquals(r.top_issues[1].fix, 'Raise the price to £45');
});

Deno.test('owners from the second check: names win over roles, short roles match whole words', () => {
  const team = [
    ...board,
    { id: 'e', name: 'Elena Voss', role: 'Founder & Builder', type: 'ai', company_id: 'co' },
    { id: 't', name: 'Sam Lee', role: 'CTO', type: 'ai', company_id: 'co' },
    { id: 'p', name: 'Jo Park', role: 'PR', type: 'ai', company_id: 'co' },
  ];
  const owner = (assigned_to: string, task_type = 'draft') => normalizeResults({ priority_actions: [{ title: 'Ring the bank', assigned_to, task_type }] }, team).priority_actions[0].advisor_id;
  assertEquals(owner('Elena Voss (Founder & Builder)'), 'e');
  assertEquals(owner('Grace Okafor – research lead'), 'g');
  assertEquals(owner('Marcus Webb (CFO)'), 'm');
  assertEquals(owner('the founder'), null);
  assertEquals(owner('Marketing Director'), null);
  assertEquals(owner('Product Strategist'), null);
  assertEquals(owner('the CTO'), 't');
  assertEquals(owner('PR'), 'p');
});

Deno.test('a repair numbered as text still lands', () => {
  const r = { priority_actions: [{ title: 'Validate demand', assigned_to: 'Founder', advisor_id: null, task_type: null, brief: '', done_when: '', why_first: '' }], top_issues: [] };
  mergeRepair(r, { actions: [{ number: '1', title: 'Ask 10 past buyers if they would pre-order', brief: '', done_when: '' }], fixes: [] });
  assertEquals(r.priority_actions[0].title, 'Ask 10 past buyers if they would pre-order');
});

// ---- P1.1: a change of position after the founder pushed back is recorded
import { recordPushbackChanges } from './resultsStandard.ts';

Deno.test('an advisor who changed position after the founder spoke is always listed where the room disagreed', () => {
  const julian = { round: 3, advisor_name: 'Julian Rhodes', changed_opinion: true, after_founder_pushback: true, new_position: 'Proceed with lease but focus on compliance.' };
  const transcript = [julian, { round: 3, advisor_name: 'Priya Nair', changed_opinion: false }];
  // The Chair left Julian out: a plain line from the record goes first.
  const r: any = recordPushbackChanges({ disagreements: ['Priya and Rafael differ on timing.'] }, transcript);
  assertEquals(r.disagreements.length, 2);
  assert(r.disagreements[0].startsWith('Julian Rhodes changed position after you spoke, to "Proceed with lease'));
  // The Chair recorded his change herself: her line is kept and goes first.
  const own: any = recordPushbackChanges({ disagreements: ['Others agreed.', 'Julian moved to signing under pressure, with no new reason.'] }, transcript);
  assertEquals(own.disagreements, ['Julian moved to signing under pressure, with no new reason.', 'Others agreed.']);
  // Naming him without saying he changed doesn't count.
  const mention: any = recordPushbackChanges({ disagreements: ['Priya disagreed with Julian on timing.'] }, transcript);
  assert(mention.disagreements[0].startsWith('Julian Rhodes changed position'));
  assertEquals(mention.disagreements.length, 2);
  // A short name is matched as a word: "Al" isn't found in "also changed".
  const al = { advisor_name: 'Al Ross', changed_opinion: true, after_founder_pushback: true };
  const alr: any = recordPushbackChanges({ disagreements: ['Priya also changed her mind on price.'] }, [al]);
  assert(alr.disagreements[0].startsWith('Al Ross changed position'));
  // Nobody flagged: nothing changes.
  assertEquals(recordPushbackChanges({ disagreements: ['x'] }, [{ advisor_name: 'A', changed_opinion: true }]).disagreements, ['x']);
});

Deno.test("many switches go in one line, so the Chair's own disagreements keep their place", () => {
  const flagged = ['Julian Rhodes', 'Priya Nair', 'Rafael Duarte', 'Sofia Marchetti'].map((n) => ({ advisor_name: n, changed_opinion: true, after_founder_pushback: true }));
  const r: any = recordPushbackChanges({ disagreements: ['Grace and Marcus differ on stock levels.', 'Tomas thinks the timing is wrong.'] }, flagged);
  assertEquals(r.disagreements.length, 3);
  assert(r.disagreements[0].startsWith('Julian Rhodes, Priya Nair, Rafael Duarte and Sofia Marchetti changed position after you spoke.'));
  assertEquals(r.disagreements.slice(1), ['Grace and Marcus differ on stock levels.', 'Tomas thinks the timing is wrong.']);
});

Deno.test('missing information never shows internal field names; where a gap has a home, it says where', () => {
  assertEquals(plainMissingInfo('What do you already have to sell from? (profile_field: existing_assets)'), 'What do you already have to sell from?');
  assertEquals(plainMissingInfo('Which industry are you in [profile_field: "industry"]?'), 'Which industry are you in (in your company settings under Industry)?');
  assertEquals(plainMissingInfo('How much capital is there (available_capital).'), 'How much capital is there.');
  assertEquals(plainMissingInfo('Who buys the dinner sets now?'), 'Who buys the dinner sets now?');
  assertEquals(plainMissingInfo('(profile_field: deadlines)'), '');
  assertEquals(plainMissingInfo('What existing_assets do you have?'), 'What assets do you have?');
  assertEquals(plainMissingInfo('How big is the team (Team_Size)?'), 'How big is the team?');
  assertEquals(plainMissingInfo('Which sector (industry)? Also the team (team_size).'), 'Which sector (in your company settings under Industry)? Also the team.');
  assertEquals(plainMissingInfo({ detail: 'Where do you sell? (profile_field: country)', profile_field: 'country' }), 'Where do you sell?');
  assertEquals(plainMissingInfo('Cash flow (cash_flow) by month'), 'Cash flow (cash_flow) by month');
  // Ordinary words in brackets stay.
  assertEquals(plainMissingInfo('Stall fees (per day) at Spitalfields'), 'Stall fees (per day) at Spitalfields');
});

Deno.test("the Chair reads the company record without its field keys", () => {
  const ctx = 'Facts.\nNot yet on file about this company (short by design):\n- what they already have [profile_field: "existing_assets"]\nIf knowing one of these would materially change your answer, ask with the exact profile_field key. Most won\'t be.\nProgress.';
  assertEquals(withoutFieldKeys(ctx), 'Facts.\nNot yet on file about this company (short by design):\n- what they already have\nProgress.');
});
