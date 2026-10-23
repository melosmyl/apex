import { assert, assertEquals } from 'jsr:@std/assert@1';
import { INDEX_LATER, MEETING_LIMITS, TASK_LIMITS, type Passage, indexPendingKnowledge, passagesSection, selectPassages, splitIntoPassages } from './knowledgePassages.ts';
import { companyContext } from './taskRun.ts';

const para = (word: string, n: number) => Array.from({ length: n }, (_, i) => `${word} sentence number ${i} says something about ${word}.`).join(' ');

Deno.test('a short item is one passage; an empty one is none', () => {
  assertEquals(splitIntoPassages('We sell candles.'), ['We sell candles.']);
  assertEquals(splitIntoPassages('   \n\n  '), []);
  assertEquals(splitIntoPassages(null), []);
});

Deno.test('a long item is split into passages of about 1,200 characters, none cut mid-word, each carrying a little of the last', () => {
  const text = [para('pricing', 40), para('delivery', 40), para('hiring', 40)].join('\n\n');
  const passages = splitIntoPassages(text);
  assert(passages.length >= 6, `${passages.length}`);
  for (const p of passages) assert(p.length <= 1200, `${p.length}`);
  // Every word of the item is in some passage.
  const all = passages.join(' ');
  for (const w of ['pricing sentence number 39', 'delivery sentence number 0', 'hiring sentence number 39']) assert(all.includes(w), w);
  // Each passage after the first opens with the end of the one before.
  for (let i = 1; i < passages.length; i++) {
    const lead = passages[i].startsWith('…') ? passages[i].slice(1).split('\n\n')[0] : '';
    if (lead) assert(passages[i - 1].endsWith(lead), `passage ${i}`);
  }
  assert(passages.slice(1).some((p) => p.startsWith('…')), 'some overlap');
});

Deno.test('a paragraph with no sentence breaks, or one enormous word, still fits, never cutting a character in two', () => {
  const words = Array.from({ length: 600 }, (_, i) => `word${i}`).join(' ');
  for (const p of splitIntoPassages(words)) assert(p.length <= 1200);
  const blob = 'x'.repeat(5000);
  const parts = splitIntoPassages(blob);
  assert(parts.every((p) => p.length <= 1200));
  assertEquals(parts.join('').replace(/…/g, '').replace(/\s/g, '').length >= 5000, true);
  const emoji = splitIntoPassages('🍽'.repeat(1300));
  assert(emoji.every((p) => !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(p)), 'no half characters');
});

const match = (doc: string, i: number, similarity: number, chars = 500, extra: Partial<Passage> = {}): Passage =>
  ({ document_id: doc, passage_index: i, text: `${doc}-${i} `.padEnd(chars, '.'), similarity, title: `Item ${doc}`, category: 'Business Plan', created_at: '2026-10-01T10:00:00Z', board_work: false, ...extra });

Deno.test('the closest passages are chosen within the limits, then put back in reading order', () => {
  const matches = [
    match('a', 0, 0.9), match('a', 1, 0.89), match('a', 2, 0.88), match('a', 3, 0.87), // only 3 of a
    match('b', 5, 0.8), match('b', 1, 0.7), match('c', 0, 0.6), match('d', 0, 0.5),
  ];
  const chosen = selectPassages(matches, { chars: 6000, count: 10, perItem: 3 });
  assertEquals(chosen.map((p) => `${p.document_id}${p.passage_index}`), ['a0', 'a1', 'a2', 'b1', 'b5', 'c0', 'd0']);
  // Characters: 500 each, so 3,000 takes six.
  assertEquals(selectPassages(matches, TASK_LIMITS).length, 6);
  // A long passage that would overflow is passed over for a shorter one.
  const long = [match('a', 0, 0.9, 5700), match('b', 0, 0.8, 400), match('c', 0, 0.7, 300)];
  assertEquals(selectPassages(long, MEETING_LIMITS).map((p) => p.document_id), ['a', 'c']);
  assertEquals(selectPassages([], MEETING_LIMITS), []);
});

Deno.test('the section names each item, its date and whose it is', () => {
  const text = passagesSection([match('a', 0, 0.9, 40), match('a', 2, 0.8, 40), match('b', 0, 0.7, 40, { board_work: true, title: 'Pricing research', category: 'Research' })], 'this question');
  assert(text.includes('the parts that bear on this question'));
  assert(text.includes('[1 October 2026, added by the founder] Item a (Business Plan):'));
  assert(text.includes("[1 October 2026, the board's work] Pricing research (Research):"));
  assertEquals(text.match(/Item a/g)?.length, 1);
  assertEquals(passagesSection([], 'x'), '');
});

Deno.test('tasks: passages, then the openings of items not quoted; without passages, openings as before', () => {
  const knowledge = [
    { id: 'a', title: 'Plan', content: 'Long plan opening', passages_indexed_at: '2026-10-23' },
    { id: 't', title: 'What you told the board: pricing', content: 'We charge £40', category: 'What you told the board', passages_indexed_at: null },
  ];
  const withPassages = companyContext({ name: 'Co' }, [...knowledge, { id: 'b', title: 'Other', content: 'Other opening', passages_indexed_at: '2026-10-23' }], [match('a', 3, 0.9, 60, { title: 'Plan' })]);
  assert(withPassages.includes('the parts that bear on this task') && withPassages.includes('a-3'));
  assert(!withPassages.includes('Long plan opening') && withPassages.includes('We charge £40') && withPassages.includes('Other opening'), 'an item quoted is not repeated; the others keep their openings');
  const without = companyContext({ name: 'Co' }, knowledge, null);
  assert(without.includes('Long plan opening') && without.includes('We charge £40') && !without.includes('bear on'));
});

// A stand-in for the database calls the indexer makes.
function fakeDb(items: any[], { failInsertFor = '', changedMeanwhile = '' } = {}) {
  const calls: any[] = [];
  return {
    calls,
    from(_table: string) {
      return {
        upsert: (rows: any[], opts: any) => {
          calls.push(['insert', rows[0].document_id, rows.length, rows[0].content_hash, opts]);
          return Promise.resolve({ error: rows[0].document_id === failInsertFor ? { message: 'no' } : null });
        },
      };
    },
    rpc(name: string, args: any) {
      calls.push([name, args.p_document_id, args.p_hash, args.p_count]);
      const data = name === 'knowledge_to_index' ? items : name === 'finish_knowledge_passages' ? args.p_document_id !== changedMeanwhile : null;
      return Promise.resolve({ data, error: null });
    },
  };
}
const quietly = async <T>(f: () => Promise<T>) => { const e = console.error; console.error = () => {}; try { return await f(); } finally { console.error = e; } };
const embedOk = (texts: string[]) => Promise.resolve(texts.map(() => [1, 0]));

Deno.test('indexing: passages stored against the words they came from, then finished; a storing failure uses one try and stops', async () => {
  const items = [
    { id: 'one', title: 'Plan', content: para('pricing', 60), content_hash: 'h1' },
    { id: 'two', title: 'Empty', content: '', content_hash: 'h2' },
    { id: 'moved', title: 'Edited meanwhile', content: 'Words.', content_hash: 'h4' },
    { id: 'bad', title: 'Bad', content: 'Some words.', content_hash: 'h3' },
    { id: 'after', title: 'After', content: 'More words.', content_hash: 'h5' },
  ];
  const db = fakeDb(items, { failInsertFor: 'bad', changedMeanwhile: 'moved' });
  const embedded: string[][] = [];
  const res = await quietly(() => indexPendingKnowledge(db, 'co', 'me', { embed: (t) => { embedded.push(t); return embedOk(t); } }));
  assertEquals(res, { indexed: 2, waiting: 3 });
  assert(embedded[0].every((t) => t.startsWith('Plan\n\n')), 'matched with its title');
  const one = db.calls.filter((c) => c[0] === 'insert' && c[1] === 'one');
  assert(one.every((c) => c[3] === 'h1' && c[2] <= 25 && c[4].ignoreDuplicates), 'in batches of 25, with its fingerprint, never twice');
  assert(db.calls.some((c) => c[0] === 'finish_knowledge_passages' && c[1] === 'one' && c[2] === 'h1' && c[3] === one.reduce((n, c) => n + c[2], 0)));
  assert(db.calls.some((c) => c[0] === 'finish_knowledge_passages' && c[1] === 'two' && c[3] === 0), 'an empty item is finished, with no passages');
  assert(db.calls.some((c) => c[0] === 'knowledge_passages_failed' && c[1] === 'bad' && c[2] === 'h3'), 'a storing failure uses one of its tries');
  assert(!db.calls.some((c) => c[0] === 'knowledge_passages_failed' && c[1] === 'moved'), 'words changed meanwhile: not a failure, just read again next time');
  assert(!db.calls.some((c) => c[1] === 'after'), 'and it stops there, so a passing hiccup costs one item one try');
});

Deno.test('indexing stops at the first embedding failure, without blaming the item', async () => {
  const items = [1, 2].map((n) => ({ id: `i${n}`, title: 'T', content: 'Words.', content_hash: `h${n}` }));
  const db = fakeDb(items);
  const res = await quietly(() => indexPendingKnowledge(db, 'co', null, { embed: () => Promise.reject(new Error('down')) }));
  assertEquals(res, { indexed: 0, waiting: 2 });
  assertEquals(db.calls.filter((c) => c[0] !== 'knowledge_to_index'), []);
});

Deno.test('indexing before a read: a few seconds, items of a modest size; a big one is left for the background', async () => {
  const big = { id: 'big', title: 'T', content: para('topic', 4000), content_hash: 'hb' };
  assert(splitIntoPassages(big.content).length > 120);
  const small = { id: 'small', title: 'T', content: 'Words.', content_hash: 'hs' };
  const db = fakeDb([big, small]);
  const res = await indexPendingKnowledge(db, 'co', null, { embed: embedOk });
  assertEquals(res, { indexed: 1, waiting: 1 });
  assert(!db.calls.some((c) => c[1] === 'big' && c[0] !== 'knowledge_to_index'));
  const later = await indexPendingKnowledge(fakeDb([big]), 'co', null, { embed: embedOk, limits: INDEX_LATER });
  assertEquals(later.indexed, 1);
  // Out of time: the embedding is never started.
  const slow = await quietly(() => indexPendingKnowledge(fakeDb([small]), 'co', null, { embed: embedOk, limits: { ...INDEX_LATER, ms: 500 } }));
  assertEquals(slow, { indexed: 0, waiting: 1 });
});
