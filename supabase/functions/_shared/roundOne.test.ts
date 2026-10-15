import { assertEquals } from 'jsr:@std/assert@1';
import { distinctRoundOne } from './roundOne.ts';

const advisors = [{ id: 'a', name: 'Ana', role: 'Finance' }, { id: 'b', name: 'Ben', role: 'Legal' }, { id: 'c', name: 'Cat', role: 'Product' }, { id: 'd', name: 'Dev', role: 'Ops' }];
const answer = (id: string, recommendation: string) => ({ advisor_id: id, advisor_name: advisors.find((a) => a.id === id)!.name, recommendation });
const later = () => Date.now() + 120_000;
const asked: string[] = [];
const ask = (advisor: any) => { asked.push(advisor.id); return Promise.resolve({ ...answer(advisor.id, `${advisor.name}'s own view`) }); };
// Vectors by meaning: same word, same direction.
const embed = (t: string) => Promise.resolve(t.toLowerCase().includes('delay') ? [1, 0] : t.toLowerCase().includes('shop') ? [0, 1] : [0.7, 0.7]);

Deno.test('the later of two near-identical answers is asked again, by meaning as well as by wording', async () => {
  asked.length = 0;
  const out = await distinctRoundOne({
    responses: [answer('a', 'Delay the lease until demand is validated.'), answer('b', 'We should delay signing; validate first.'), answer('c', 'Open a pop-up shop for a month.')],
    selectedAdvisors: advisors, deadlineAt: later(), ask, embed,
  });
  assertEquals(asked, ['b']);
  assertEquals(out.map((r: any) => [r.advisor_id, r.redone_after || null]), [['a', null], ['b', 'Ana'], ['c', null]]);
});

Deno.test('at most two are asked again, and none without a minute to spare', async () => {
  asked.length = 0;
  const same = advisors.map((a) => answer(a.id, 'Delay until validated.'));
  await distinctRoundOne({ responses: same, selectedAdvisors: advisors, deadlineAt: later(), ask, embed });
  assertEquals(asked.length, 2);
  asked.length = 0;
  const out = await distinctRoundOne({ responses: same, selectedAdvisors: advisors, deadlineAt: Date.now() + 30_000, ask, embed });
  assertEquals([asked.length, out], [0, same]);
});

Deno.test("text in another script isn't counted as identical just because it can't be read", async () => {
  asked.length = 0;
  const arabic = [answer('a', 'أجّل توقيع العقد'), answer('b', '先验证需求')];
  await distinctRoundOne({ responses: arabic, selectedAdvisors: advisors, deadlineAt: later(), ask, embed: (t: string) => Promise.resolve(t.startsWith('أ') ? [1, 0] : [0, 1]) });
  assertEquals(asked, []);
});
