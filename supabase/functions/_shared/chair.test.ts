import { assertEquals } from 'jsr:@std/assert@1';
import { BUILT_IN_CHAIR, chairCallFields, findChair, withoutChair } from './chair.ts';
import { resolveAdvisor } from './advisorResolution.ts';

const a = (id: string, over: Record<string, unknown> = {}) => ({ id, type: 'ai', role: 'Advisor', created_at: `2026-01-0${id.length}`, ...over });

Deno.test('the library Chair is the Chair, wherever she is in the list', () => {
  const chair = a('c', { library_key: 'chair', role: 'The Chair' });
  assertEquals(findChair([a('x'), a('y'), chair])?.id, 'c');
});

Deno.test('a human whose title says Chair is never the Chair', () => {
  const human = a('h', { type: 'human', role: 'Board Chair' });
  assertEquals(findChair([human, a('x')]), null);
  assertEquals(findChair([human, a('x', { role: 'Co-chair' })])?.id, 'x');
});

Deno.test('the library Chair wins over a role match, and two Chairs resolve the same way every time', () => {
  const byRole = a('r', { role: 'Chairperson', created_at: '2025-01-01' });
  const lib1 = a('l1', { library_key: 'chair', created_at: '2026-02-01' });
  const lib2 = a('l2', { library_key: 'chair', created_at: '2026-01-01' });
  assertEquals(findChair([byRole, lib1, lib2])?.id, 'l2');
  assertEquals(findChair([lib2, lib1, byRole])?.id, 'l2');
});

Deno.test('a board without a Chair gets the built-in one, on Claude', () => {
  assertEquals(findChair([a('x'), a('y')]), null);
  const fields = chairCallFields(null) as { advisor_override: typeof BUILT_IN_CHAIR; system_instructions: string };
  assertEquals(fields.advisor_override.default_provider, 'anthropic');
  assertEquals(fields.advisor_override.library_key, 'chair');
  assertEquals(fields.system_instructions, BUILT_IN_CHAIR.system_instructions);
  assertEquals(chairCallFields(a('c', { system_instructions: 'mine' })), { advisor_id: 'c', system_instructions: 'mine' });
});

Deno.test('the debaters are everyone but the Chair', () => {
  const chair = a('c', { library_key: 'chair' });
  assertEquals(withoutChair([a('x'), chair, a('y')], chair).map((d) => d.id), ['x', 'y']);
  assertEquals(withoutChair([a('x')], null).map((d) => d.id), ['x']);
});

Deno.test('task-owner matching still falls back to the Chair, never a human', () => {
  const advisors = [a('h', { type: 'human', role: 'Chair of the advisory group', name: 'Hu Man' }), a('x', { name: 'Xia' }), a('c', { library_key: 'chair', name: 'Margaret' })];
  assertEquals(resolveAdvisor(null, advisors.filter((v) => v.type !== 'human'), [])?.id, 'c');
});
