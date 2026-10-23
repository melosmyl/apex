// Shared embedding helper. text-embedding-3-small returns 1536 dimensions,
// matching the vector column on decisions.
const EMBEDDING_MODEL = 'text-embedding-3-small';
const MAX_EMBED_CHARS = 8000;

export async function embedText(text: string): Promise<number[]> {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured');

  // Bounded: notes and decisions are free text with no length limit, and the
  // first few thousand words carry the meaning anyway.
  const input = (text || '').trim().slice(0, MAX_EMBED_CHARS);
  if (!input) throw new Error('Cannot embed empty text');

  // OPENAI_BASE_URL is for the local test stack's fake provider, as in
  // llmCall.ts; production leaves it unset.
  const base = Deno.env.get('OPENAI_BASE_URL') || 'https://api.openai.com/v1';
  const res = await fetch(`${base}/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input }),
    // A hung request fails instead of holding up a meeting or task, which
    // then reads by recency and opening instead.
    signal: AbortSignal.timeout(20_000),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || `Embedding failed (${res.status})`);

  const vector = data.data?.[0]?.embedding;
  if (!Array.isArray(vector)) throw new Error('Embedding response contained no vector');
  return vector;
}

// Many texts in one request (Knowledge passages): the same model, in the
// order given. Up to 100 at a time; callers batch beyond that. Gives up
// after timeoutMs (30 seconds unless the caller has less time).
export async function embedTexts(texts: string[], timeoutMs = 30_000): Promise<number[][]> {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured');
  const input = texts.map((t) => (t || '').trim().slice(0, MAX_EMBED_CHARS));
  if (!input.length) return [];
  if (input.length > 100) throw new Error('At most 100 texts per request');
  if (input.some((t) => !t)) throw new Error('Cannot embed empty text');
  const base = Deno.env.get('OPENAI_BASE_URL') || 'https://api.openai.com/v1';
  const res = await fetch(`${base}/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input }),
    signal: AbortSignal.timeout(Math.max(1, Math.min(timeoutMs, 30_000))),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || `Embedding failed (${res.status})`);
  const vectors = (data.data || []).slice().sort((a: { index: number }, b: { index: number }) => a.index - b.index).map((d: { embedding: number[] }) => d.embedding);
  if (vectors.length !== input.length || vectors.some((v: unknown) => !Array.isArray(v))) throw new Error('Embedding response is missing vectors');
  return vectors;
}

// The text a decision is remembered by: what was asked, and what was decided.
export function decisionEmbeddingText(decision: {
  question?: string;
  final_recommendation?: string;
  decision_taken?: string;
  summary?: string;
}): string {
  return [
    decision.question,
    decision.final_recommendation,
    decision.decision_taken,
    decision.summary,
  ].filter(Boolean).join('\n\n');
}

// The text a note is remembered by. Tags are included once tagging has run
// (Phase B) so a note's later semantic match also benefits from the
// classifier's own words, not just the founder's raw phrasing.
export function noteEmbeddingText(note: { raw_text?: string; tags?: string[] }): string {
  return [note.raw_text, note.tags?.length ? note.tags.join(', ') : null]
    .filter(Boolean).join('\n\n');
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}
