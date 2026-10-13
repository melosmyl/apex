import { assertEquals, assert } from 'jsr:@std/assert@1';
import { PROFESSIONAL_NOTE, companyContext, finishResult, needsProfessionalCheck, openQuestions, resultAsText, taskPrompt, voiceSamples } from './taskRun.ts';

Deno.test('legal and tax work gets the lawyer-or-accountant line; ordinary messages do not', () => {
  for (const t of ['Draft a contractor agreement for Sam', 'Write an NDA for the supplier', 'Register for VAT with HMRC', 'Reply to the landlord about the lease',
    'Write a privacy policy', 'Set up a limited company', 'Write a job offer letter', 'GDPR consent form'])
    assertEquals(needsProfessionalCheck(t), true, t);
  // From the second check: ordinary words that aren't legal work.
  for (const t of ['Message the two charity shops', 'Write a Vinted listing for the coat', 'Email Sarah the quote',
    "I'll incorporate your feedback", 'All prices include VAT', 'Money-back guarantee on every coat',
    'We reached agreement on the price', 'Our first employee starts Monday', 'Tax-free shopping weekend', 'Find a contract manufacturer for the mugs'])
    assertEquals(needsProfessionalCheck(t), false, t);
});

Deno.test("the founder's voice comes from their own writing, deduplicated and capped", () => {
  const v = voiceSamples({
    followups: ['What about doing it in the spring instead, when demand is higher?'],
    notes: ['short', 'Called the shop on Monday, they said bring stock on Thursdays.', 'Called the shop on Monday, they said bring stock on Thursdays.'],
    questions: ['x'.repeat(600), 'y'.repeat(600)],
  }, 900);
  assertEquals(v[0], 'What about doing it in the spring instead, when demand is higher?');
  assertEquals(v.filter((s) => s.startsWith('Called')).length, 1);
  assert(!v.includes('short'));
  assert(v.join('').length <= 900);
});

Deno.test('a draft is tidied, and a contract always carries the professional note', () => {
  const r: any = finishResult('draft', { title: 'Agreement', kind: 'document', subject: '', body: 'This contractor agreement is between...', placeholders: ['[rate]', '', '[start date]'], check_before_sending: ['a', 'b', 'c', 'd'], professional_check: false }, { title: 'Draft the freelancer agreement' });
  assertEquals(r.professional_note, PROFESSIONAL_NOTE);
  assertEquals(r.placeholders, ['[rate]', '[start date]']);
  assertEquals(r.check_before_sending.length, 3);
  const plain = finishResult('draft', { title: 'Hi', kind: 'message', subject: '', body: 'Hello there', placeholders: [], check_before_sending: [], professional_check: false }, { title: 'Message the charity shops' });
  assertEquals(plain.professional_note, '');
});

Deno.test('a plan keeps real dates only, caps steps, and drops an empty helper', () => {
  const steps = [{ date: '2026-10-14', step: 'Call the shop', detail: '' }, { date: 'next Tuesday', step: 'Visit', detail: 'Bring coats' }, { date: '2026-10-16', step: '', detail: '' },
    ...Array.from({ length: 12 }, (_, i) => ({ date: '2026-10-20', step: `Step ${i}`, detail: '' }))];
  const r: any = finishResult('plan', { title: 'Plan', summary: 'Do it', steps, helper: { kind: 'none', title: '', body: '' }, professional_check: false }, { title: 'Plan the first week' });
  assertEquals(r.steps.length, 10);
  assertEquals(r.steps[0].date, '2026-10-14');
  assertEquals(r.steps[1].date, '');
  const bad: any = finishResult('plan', { title: 'P', summary: '', steps: [{ date: '2026-02-30', step: 'x', detail: '' }], helper: { kind: 'none', title: '', body: '' }, professional_check: false }, { title: 'P' });
  assertEquals(bad.steps[0].date, '');
  assertEquals(r.helper, null);
  const text = resultAsText('plan', r);
  assert(text.startsWith('Do it\n\n1. 2026-10-14: Call the shop'));
});

Deno.test('the prompt carries the task, the verdict, the voice and a redo, and nothing to send with', () => {
  const p = taskPrompt({
    type: 'draft', today: '2026-10-14', voice: ['I tend to keep things short.'],
    task: { title: 'Message the charity shops', description: 'Ask about coat stock on Mondays', done_when: 'Message ready' },
    meeting: { question: 'Should I resell coats?', board_resolution: { verdict: 'Start small.' } },
    redo: { notes: 'Make it friendlier', previous: { subject: '', body: 'Dear Sir', professional_note: '' } },
  });
  assert(p.meeting_context.includes('Today is 2026-10-14'));
  assert(p.meeting_context.includes("The room's verdict: Start small."));
  assert(p.meeting_context.includes('"""I tend to keep things short."""'));
  assert(p.meeting_context.includes('Make it friendlier') && p.meeting_context.includes('Dear Sir'));
  assert(p.system_instructions.includes('you never send anything'));
  assert(companyContext({ name: 'Second Coat', target_customer: 'Students' }, [{ title: 'Prices', content: 'Coats £45' }]).includes('Coats £45'));
});

Deno.test("what the meeting left open goes in as unknowns; answered decisions are settled; the founder's own word wins", () => {
  const resolution = {
    verdict: 'Test the price first.',
    missing_information: ['The exact material of the dinner set', { detail: 'Lead times from the supplier' }],
    founder_questions: ['Do you know the exact material?', 'Will you sell at the Saturday market?', 'The exact material of the dinner set'],
    discussion_evaluation: { uncertain_assumptions: ['Parents will pay £45'] },
  };
  assertEquals(openQuestions(resolution).unknown, ['The exact material of the dinner set', 'Lead times from the supplier', 'Do you know the exact material?', 'Will you sell at the Saturday market?', 'Parents will pay £45']);
  const answered = openQuestions(resolution, { 1: 'yes', 0: 'not_sure' });
  assertEquals(answered.decided, ['Will you sell at the Saturday market? Yes.']);
  assert(!answered.unknown.includes('Will you sell at the Saturday market?') && answered.unknown.includes('Do you know the exact material?'));
  // A settled decision is never also listed as unknown.
  const overlap = openQuestions({ missing_information: ['Will you sell at the market?'], founder_questions: ['Will you sell at the market?'] }, { 0: 'no' });
  assertEquals(overlap, { unknown: [], decided: ['Will you sell at the market? No.'] });
  // Numbered like the results page: empty entries don't shift the answers.
  assertEquals(openQuestions({ founder_questions: ['', 'Q1?', 'Q2?'] }, { 0: 'yes' }).decided, ['Q1? Yes.']);
  // Odd shapes from older meetings never break a run.
  assertEquals(openQuestions(null), { unknown: [], decided: [] });
  assertEquals(openQuestions({ founder_questions: { a: 1 }, missing_information: 'Price unknown' }), { unknown: [], decided: [] });

  const p = taskPrompt({ type: 'draft', today: '2026-10-14', voice: [], task: { title: 'Message the parents' }, meeting: { question: 'q', board_resolution: resolution, founder_answers: { 1: 'yes' } } });
  assert(p.meeting_context.includes('THE FOUNDER HAS DECIDED:\n- Will you sell at the Saturday market? Yes.'));
  assert(p.meeting_context.includes('STILL UNKNOWN') && p.meeting_context.includes('- The exact material of the dinner set'));
  assert(p.system_instructions.includes("the company record, the task's brief, and their notes on a redo"));
  assert(p.system_instructions.includes('What advisors said in the meeting is not a source'));
  assert(taskPrompt({ type: 'plan', today: '2026-10-14', voice: [], task: { title: 't' } }).system_instructions.includes('STILL UNKNOWN'));
  assert(companyContext({ name: 'petit m' }).startsWith('THE COMPANY RECORD'));
});
