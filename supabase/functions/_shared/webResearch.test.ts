import { assert, assertEquals } from 'jsr:@std/assert@1';
import { BLOCKED_DOMAINS, citedSources, codeRan, collectSources, reportText, researchTools, skippedSitesIn } from './webResearch.ts';
import { finishResearch } from './taskRun.ts';

const blocks = [
  { type: 'server_tool_use', id: 's1', name: 'web_search', input: { query: 'q' } },
  { type: 'web_search_tool_result', tool_use_id: 's1', content: [
    { type: 'web_search_result', url: 'https://a.example/x', title: 'A', page_age: 'Oct 2026' },
    { type: 'web_search_result', url: 'https://b.example/y', title: 'B' },
  ] },
  { type: 'web_fetch_tool_result', content: { type: 'web_fetch_result', url: 'https://c.example/z', content: { title: 'C' } } },
  { type: 'text', text: 'Supplier A sells bales.', citations: [{ type: 'web_search_result_location', url: 'https://a.example/x', title: 'A', cited_text: 'bales' }] },
  { type: 'text', text: ' Made-up claim.', citations: [] },
];

Deno.test('only pages the answer actually cites can be a source, fetched pages included', () => {
  const withFetch = [...blocks, { type: 'text', text: ' Page C says delivery is free.', citations: [{ type: 'char_location', document_index: 0, document_title: 'C', cited_text: 'free delivery' }] }];
  const s = collectSources(withFetch);
  assertEquals(s.map((x) => x.url), ['https://a.example/x', 'https://b.example/y', 'https://c.example/z']);
  // B was returned by the search but never cited: it can't back a finding.
  assertEquals(citedSources(s).map((x) => x.url), ['https://a.example/x', 'https://c.example/z']);
  assertEquals(reportText(withFetch, s), 'Supplier A sells bales. [1] Made-up claim. Page C says delivery is free. [2]');
  assertEquals(collectSources([{ type: 'text', text: 'see https://invented.example', citations: [] }]), []);
});

Deno.test('code counts as run only from a result block', () => {
  assertEquals(codeRan([{ type: 'bash_code_execution_tool_result', content: { type: 'bash_code_execution_result', return_code: 0 } }]), true);
  assertEquals(codeRan([{ type: 'bash_code_execution_tool_result', content: { type: 'bash_code_execution_result', return_code: 1 } }]), false);
  assertEquals(codeRan([{ type: 'text', text: 'I ran the code' }]), false);
});

Deno.test('the skip list blocks Vinted and names it when a task mentions it', () => {
  assert(BLOCKED_DOMAINS.includes('vinted.co.uk'));
  assertEquals(skippedSitesIn('What do coats sell for on Vinted?').map((s) => s.name), ['Vinted']);
  assertEquals(skippedSitesIn('Find coat wholesalers'), []);
  const r: any[] = researchTools('research'), c: any[] = researchTools('calculate');
  assertEquals([r[0].max_uses, r[1].max_uses, c[0].max_uses, c[1].max_uses], [5, 8, 3, 6]);
  assert(c.some((t: any) => t.type.startsWith('code_execution')) && !r.some((t: any) => t.type.startsWith('code_execution')));
  // Called directly, both of them; and only what's left of the caps.
  assert([...r, ...c].filter((t: any) => t.type.startsWith('web_')).every((t: any) => t.allowed_callers?.[0] === 'direct'));
  // What's left of the caps, but never nothing: a paused turn must be able to finish.
  const left: any[] = researchTools('research', { searches: 2, pages: 0 });
  assertEquals(left.map((t: any) => [t.type.split('_2')[0], t.max_uses]), [['web_search', 2], ['web_fetch', 1]]);
});

Deno.test('a finding survives only with a real source; none left means no result', () => {
  const sources = [{ url: 'https://a.example/x', title: 'A' }, { url: 'https://b.example/y', title: 'B' }];
  const ok: any = finishResearch('research', { title: 'T', summary: 's', findings: [{ finding: 'f1', detail: '', source: 1 }, { finding: 'f2', detail: '', source: 3 }, { finding: 'f3', detail: '', source: '2' }],
    legitimacy: [], risks: [], unsure: [], professional_check: false }, sources, { searches: 2, pages: 1 }, { title: 'T' });
  assertEquals(ok.findings.map((f: any) => f.finding), ['f1', 'f3']);
  assertEquals(ok.sources.length, 2);
  assertEquals(finishResearch('research', { findings: [{ finding: 'f', source: 0 }] }, sources, {}, { title: 'T' }), null);
  const calc: any = finishResearch('calculate', { answer: '£33', workings: [{ step: 'a', result: 'b' }], inputs: [
    { name: 'x', value: '1', source: 0, from_founder: false },
    { name: 'Price', value: '£45', source: 0, from_founder: true },
    { name: 'Rent', value: '£900', source: 0, from_founder: true },
  ] }, sources, { codeUsed: true, founderText: 'I sell coats at £45 each.' }, { title: 'T' });
  assertEquals([calc.code_used, calc.inputs[0].assumed], [true, true]);
  // "Your figure" only when it's in the founder's own words.
  assertEquals([calc.inputs[1].from_founder, calc.inputs[2].from_founder, calc.inputs[2].assumed], [true, false, true]);
  // Short numbers need their unit: "£3" isn't "3 years trading", "10%" isn't "10 coats".
  const short: any = finishResearch('calculate', { answer: 'x', workings: [{ step: 'a', result: 'b' }], inputs: [
    { name: 'Fee', value: '£3', source: 0, from_founder: true }, { name: 'Cut', value: '10%', source: 0, from_founder: true },
    { name: 'Rate', value: '12.5%', source: 0, from_founder: true },
  ] }, sources, { founderText: 'Trading 3 years, 10 coats in stock, platform takes 12.5 per cent.' }, { title: 'T' });
  assertEquals(short.inputs.map((x: any) => x.from_founder), [false, false, true]);
  const legit: any = finishResearch('research', { findings: [{ finding: 'f', source: 1 }], legitimacy: [{ name: 'X', verdict: 'looks_legitimate', why: 'says so', source: 0 }] }, sources, {}, { title: 'T' });
  assertEquals([legit.legitimacy[0].verdict, legit.legitimacy[0].why], ['unclear', 'No source checked this.']);
  assertEquals(finishResearch('calculate', { answer: '', workings: [] }, sources, {}, { title: 'T' }), null);
});
