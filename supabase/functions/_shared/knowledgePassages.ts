// Knowledge, read by what matters (owner, 23 October 2026, Stage 1).
//
// Every Knowledge item is split into passages, each with an embedding, and
// meetings and "Do this for me" tasks read the passages that bear on their
// question instead of the first few hundred characters of the newest items.
// Typed, pasted, accepted from a task or (Stage 2) uploaded: all the same.
//
//   - An item whose words change is marked by the database; whoever reads
//     next (a meeting or a task) indexes what's marked first, for a few
//     seconds at most, so nothing is read stale. Anything left over (or too
//     long to do in those seconds) is read by its opening this time, as
//     before, and a meeting carries on indexing it in the background.
//   - Passages are stored against a fingerprint of the words they came from,
//     and only those of an item's current words are read (see the migration).
//   - What the founder told the board in earlier meetings is never lost: the
//     newest five entries are given in full (toldBoardSection), and older
//     ones are read by passage like the rest of Knowledge.
// deno-lint-ignore-file no-explicit-any
import { embedText, embedTexts } from './embeddings.ts';
import { dayOf } from './recordDates.ts';

export const TOLD_BOARD = 'What you told the board';
export const TOLD_BOARD_IN_FULL = 5;
const TOLD_BOARD_BUDGET = 12_000;
const TOLD_BOARD_OPENING = 600;

export const PASSAGE_CHARS = 1200;
export const PASSAGE_OVERLAP = 150;
// What a meeting and a task read (owner: about 6,000 characters for
// meetings, about 3,000 for tasks).
export const MEETING_LIMITS = { chars: 6000, count: 10, perItem: 3 };
export const TASK_LIMITS = { chars: 3000, count: 6, perItem: 3 };
// Indexing: before a meeting or task reads, a few seconds and items of a
// modest size; in the background after a meeting starts (alongside its
// first round, so kept small), up to 100 seconds and one long item at a time.
// Past MAX_ITEM_PASSAGES (about 960,000 characters, some 300 pages) the rest
// of an item isn't split: it's still listed by its opening.
export const MAX_ITEM_PASSAGES = 800;
export const INDEX_NOW = { items: 25, passages: 120, perItem: 120, ms: 6_000 };
export const INDEX_LATER = { items: 25, passages: MAX_ITEM_PASSAGES, perItem: MAX_ITEM_PASSAGES, ms: 100_000 };
type IndexLimits = typeof INDEX_NOW;
const EMBED_BATCH = 100, INSERT_BATCH = 25;

// Paragraphs first, then sentences, then words: passages of about
// PASSAGE_CHARS, each starting with the last few lines of the one before so
// nothing is cut mid-thought.
export function splitIntoPassages(text: unknown, size = PASSAGE_CHARS, overlap = PASSAGE_OVERLAP): string[] {
  const clean = String(text ?? '').replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  if (!clean) return [];
  // Pieces no longer than `size`: paragraphs, or a long paragraph's
  // sentences, or a long sentence's words.
  const pieces: string[] = [];
  const pushWords = (s: string) => {
    let cur = '';
    for (const w of s.split(' ')) {
      if (w.length > size) {
        // By character, so nothing is cut through the middle of one (an emoji).
        if (cur) pieces.push(cur);
        const chars = Array.from(w);
        for (let i = 0; i < chars.length; i += size) pieces.push(chars.slice(i, i + size).join(''));
        cur = '';
        continue;
      }
      if (cur && cur.length + 1 + w.length > size) { pieces.push(cur); cur = w; } else cur = cur ? `${cur} ${w}` : w;
    }
    if (cur) pieces.push(cur);
  };
  for (const para of clean.split(/\n\s*\n/)) {
    const p = para.trim();
    if (!p) continue;
    if (p.length <= size) { pieces.push(p); continue; }
    let cur = '';
    for (const sentence of p.split(/(?<=[.!?])\s+/)) {
      if (sentence.length > size) { if (cur) { pieces.push(cur); cur = ''; } pushWords(sentence); continue; }
      if (cur && cur.length + 1 + sentence.length > size) { pieces.push(cur); cur = sentence; } else cur = cur ? `${cur} ${sentence}` : sentence;
    }
    if (cur) pieces.push(cur);
  }
  // Pieces joined into passages, each carrying a little of the last.
  const passages: string[] = [];
  let cur = '';
  for (const piece of pieces) {
    if (cur && cur.length + 2 + piece.length > size) {
      passages.push(cur);
      const tail = cur.slice(-overlap);
      const lead = tail.includes(' ') ? tail.slice(tail.indexOf(' ') + 1) : '';
      cur = lead && lead.length + 2 + piece.length <= size ? `…${lead}\n\n${piece}` : piece;
    } else cur = cur ? `${cur}\n\n${piece}` : piece;
  }
  if (cur) passages.push(cur);
  return passages;
}

// The text a passage is matched by: its item's title gives it context.
const matchText = (title: unknown, passage: string) => `${String(title ?? '').trim()}\n\n${passage}`.trim();

// Indexes the Knowledge items in one company that are waiting for it (the
// founder's own, or with ownerId null everyone's), newest first, within the
// limits. If embedding fails or time runs out, it stops: what's left is read
// by its opening and tried next time. If storing fails, it stops too, and
// that's one of the item's three tries (only that item's, so a passing
// database hiccup can't use up everyone's).
export async function indexPendingKnowledge(db: any, companyId: string, ownerId: string | null,
  { embed = embedTexts, limits = INDEX_NOW }: { embed?: (t: string[], timeoutMs?: number) => Promise<number[][]>; limits?: IndexLimits } = {}) {
  const until = Date.now() + limits.ms;
  const { data: items, error } = await db.rpc('knowledge_to_index', { p_company_id: companyId, p_owner_id: ownerId, p_limit: limits.items });
  if (error) throw new Error(`reading Knowledge to index: ${error.message}`);
  let indexed = 0, spent = 0;
  for (const item of items || []) {
    if (Date.now() >= until) break;
    const passages = splitIntoPassages(item.content).slice(0, MAX_ITEM_PASSAGES);
    if (passages.length > limits.perItem || spent + passages.length > limits.passages) continue;
    spent += passages.length;
    const vectors: number[][] = [];
    try {
      for (let i = 0; i < passages.length; i += EMBED_BATCH) {
        const left = until - Date.now();
        if (left < 1000) throw new Error('out of time');
        vectors.push(...await embed(passages.slice(i, i + EMBED_BATCH).map((p) => matchText(item.title, p)), left));
      }
    } catch (e) {
      console.error(`Indexing Knowledge stopped (${(e as Error).message}); what's left is read by its opening for now.`);
      break;
    }
    try {
      const rows = passages.map((text, passage_index) => ({ document_id: item.id, company_id: companyId, content_hash: item.content_hash, passage_index, text, embedding: JSON.stringify(vectors[passage_index]) }));
      for (let i = 0; i < rows.length; i += INSERT_BATCH) {
        const { error: insErr } = await db.from('knowledge_passages').upsert(rows.slice(i, i + INSERT_BATCH), { onConflict: 'document_id,content_hash,passage_index', ignoreDuplicates: true });
        if (insErr) throw new Error(insErr.message);
      }
      // Done only if its words are still the ones read (if not, it's read
      // fresh next time).
      const { data: done, error: finErr } = await db.rpc('finish_knowledge_passages', { p_document_id: item.id, p_hash: item.content_hash, p_count: passages.length });
      if (finErr) throw new Error(finErr.message);
      if (done) indexed += 1;
    } catch (e) {
      console.error(`Indexing Knowledge item ${item.id} failed; it is read by its opening for now:`, (e as Error).message);
      await db.rpc('knowledge_passages_failed', { p_document_id: item.id, p_hash: item.content_hash }).then(() => {}, () => {});
      break;
    }
  }
  return { indexed, waiting: Math.max(0, (items || []).length - indexed) };
}

export type Passage = { document_id: string; passage_index: number; text: string; similarity: number; title: string; category: string | null; created_at: string; board_work: boolean };

// The closest passages, within the limits: most similar first, at most
// `perItem` from any one item, `count` in all, `chars` of text. Then put back
// in reading order, item by item.
export function selectPassages(matches: Passage[] = [], { chars, count, perItem }: { chars: number; count: number; perItem: number }) {
  const chosen: Passage[] = [];
  const perDoc = new Map<string, number>();
  let used = 0;
  for (const m of [...matches].sort((a, b) => b.similarity - a.similarity)) {
    if (chosen.length >= count) break;
    if ((perDoc.get(m.document_id) || 0) >= perItem) continue;
    if (used + m.text.length > chars) continue;
    chosen.push(m);
    used += m.text.length;
    perDoc.set(m.document_id, (perDoc.get(m.document_id) || 0) + 1);
  }
  const firstSeen = new Map(chosen.map((m, i) => [m.document_id, i]));
  return chosen.sort((a, b) => (firstSeen.get(a.document_id)! - firstSeen.get(b.document_id)!) || (a.passage_index - b.passage_index));
}

// The passages that bear on `question`, from the founder's own Knowledge in
// one company (ownerId null: the whole company's), leaving out the items in
// `exclude` (given in full already). Null if none were found or matching
// failed (it throws), so the caller reads by opening instead.
export async function relevantPassages(db: any, companyId: string, ownerId: string | null, question: string,
  limits: { chars: number; count: number; perItem: number },
  { founderOnly = false, exclude = [], embed = embedText }: { founderOnly?: boolean; exclude?: string[]; embed?: (t: string) => Promise<number[]> } = {}) {
  const vector = await embed(question);
  const { data, error } = await db.rpc('match_knowledge_passages', {
    p_company_id: companyId, p_owner_id: ownerId, p_query_embedding: JSON.stringify(vector),
    p_match_count: 40, p_founder_only: founderOnly, p_per_item: limits.perItem, p_exclude: exclude,
  });
  if (error) throw new Error(error.message);
  const chosen = selectPassages(data || [], limits);
  return chosen.length ? chosen : null;
}

// The passages for the record, grouped by item, each item dated and labelled
// with whose it is.
export function passagesSection(passages: Passage[], about: string) {
  if (!passages?.length) return '';
  const byDoc = new Map<string, Passage[]>();
  for (const p of passages) byDoc.set(p.document_id, [...(byDoc.get(p.document_id) || []), p]);
  let text = `\nFrom the founder's Knowledge, the parts that bear on ${about} (dated; "the board's work" was made by an advisor and accepted by the founder, "added by the founder" is theirs, "the founder told the board" is their own words in an earlier meeting; "…" marks where a passage starts or stops inside a longer item):\n`;
  for (const ps of byDoc.values()) {
    const d = ps[0];
    const when = dayOf(d.created_at);
    if (d.category === TOLD_BOARD) {
      const meeting = String(d.title || '').replace(/^What you told the board:\s*/, '').slice(0, 120);
      text += `[${when ? `${when}, ` : ''}the founder told the board${meeting ? `, in the meeting on "${meeting}"` : ''}]:\n`;
    } else text += `[${when ? `${when}, ` : ''}${d.board_work ? "the board's work" : 'added by the founder'}] ${d.title}${d.category ? ` (${d.category})` : ''}:\n`;
    for (const p of ps) text += `${p.text}\n…\n`;
  }
  return text;
}

// The newest "What you told the board" entries, in full, each dated with the
// meeting it was said in (the same block for meetings and tasks). Together
// they're given whole up to TOLD_BOARD_BUDGET characters: a few lines each is
// usual, so that's only for a founder who's said a great deal or pasted a lot
// into one. An entry that doesn't fit whole gives its first 600 characters,
// as before, and is matched by passage like older ones, so the rest still
// reaches the board where it bears on the question.
export function toldBoardInFull(entries: any[] = []) {
  let left = TOLD_BOARD_BUDGET;
  return (entries || []).slice(0, TOLD_BOARD_IN_FULL).map((d) => {
    const whole = String(d.content || '').length <= left;
    if (whole) left -= String(d.content || '').length;
    return { d, whole };
  });
}
// The entries given whole, so left out of the passages.
export const toldBoardWhole = (entries: any[] = []) => toldBoardInFull(entries).filter((t) => t.whole).map((t) => t.d.id);

export function toldBoardSection(entries: any[] = []) {
  const told = toldBoardInFull(entries);
  if (!told.length) return '';
  let text = `\nWhat the founder told the board in earlier meetings (their words, dated; they may have edited them since):\n`;
  for (const { d, whole } of told) {
    const when = dayOf(d.created_at);
    const about = String(d.title || '').replace(/^What you told the board:\s*/, '').slice(0, 120);
    const words = String(d.content || '');
    const shown = whole ? words : `${words.slice(0, TOLD_BOARD_OPENING)}… [the rest of this reaches the board by passage, where it bears on the question]`;
    text += `On ${when || 'an earlier day'}${about ? `, in the meeting on "${about}"` : ''}:\n${shown}\n`;
  }
  return text;
}
