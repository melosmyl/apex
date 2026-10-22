import { assert, assertEquals } from 'jsr:@std/assert@1';
import { dayOf, todayLine } from './recordDates.ts';
import { oneEach } from './commitments.ts';
import { companyProfile } from './companyProfile.ts';
import { pastMeetingsSection } from './founderCalls.ts';

Deno.test('statements are dated in UK time, and the record says what day it is', () => {
  assertEquals(dayOf('2026-10-15T09:30:00Z'), '15 October 2026');
  // Just after midnight in London is already the next day there.
  assertEquals(dayOf('2026-10-15T23:30:00Z'), '16 October 2026');
  assertEquals(dayOf(null), '');
  assertEquals(dayOf('not a date'), '');
  const line = todayLine(new Date('2026-10-22T12:00:00Z'));
  assert(line.startsWith('Today is Thursday 22 October 2026.'));
  assert(line.includes('if that day has passed, ask whether it still stands'));
});

Deno.test('each commitment once: same words only, the longest-open copy, with how often it was agreed', () => {
  const list = oneEach([
    { title: 'Secure supplier quotes and lead times', days_open: 7, advisor_id: 'a' },
    { title: 'Secure supplier quotes and lead times.', days_open: 9, advisor_id: 'b' },
    { title: 'secure  supplier quotes and lead times', days_open: 3 },
    { title: 'Secure supplier quotes and lead times for ceramic and silicone components.', days_open: 7 },
    { title: 'Complete UKIPO design and trademark searches', days_open: 7 },
  ]);
  assertEquals(list.length, 3);
  assertEquals(list[0].days_open, 9);
  assertEquals(list[0].advisor_id, 'b');
  assertEquals(list[0].times_agreed, 3);
  // Worded differently: kept, not merged by guesswork.
  assertEquals(list[1].title, 'Secure supplier quotes and lead times for ceramic and silicone components.');
  assertEquals(oneEach([]), []);
  // Titles with no words are never merged.
  assertEquals(oneEach([{ id: 'x', title: '' }, { id: 'y', title: '...' }]).length, 2);
});

Deno.test("the profile and past meetings carry their dates", () => {
  const block = companyProfile({ name: 'petit m', description: 'Dinner sets', updated_at: '2026-10-14T10:00:00Z' });
  assert(block.includes('(Their company profile, last saved on 14 October 2026; some answers in it may be older.)\n- What it is: Dinner sets'));
  assert(!companyProfile({ name: 'petit m', description: 'Dinner sets' }).includes('last saved'));
  const past = pastMeetingsSection([{ question: '£45 or £65?', created_at: '2026-10-16T10:00:00Z', board_resolution: { recommended_direction: '£65' } }]);
  assert(past.includes('- [16 October 2026] Q: £45 or £65?'));
});

Deno.test("a saved record gets today's date when it's used again, days later", async () => {
  const { withToday } = await import('./recordDates.ts');
  const saved = `${todayLine(new Date('2026-10-22T12:00:00Z'))}WHAT THE FOUNDER HAS TOLD US about petit m`;
  const later = withToday(saved, new Date('2026-10-25T09:00:00Z'));
  assert(later.startsWith('Today is Sunday 25 October 2026.'));
  assert(later.endsWith('WHAT THE FOUNDER HAS TOLD US about petit m'));
  assertEquals(later.split('Today is').length, 2);
  // An older record without the line is left as it was.
  assertEquals(withToday('Company: petit m'), 'Company: petit m');
  assertEquals(withToday(null), '');
});
