// Shared embedding helper. text-embedding-3-small returns 1536 dimensions,
// matching the vector column on decisions.
const EMBEDDING_MODEL = 'text-embedding-3-small';

export async function embedText(text: string): Promise<number[]> {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured');

  const input = (text || '').trim();
  if (!input) throw new Error('Cannot embed empty text');

  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || `Embedding failed (${res.status})`);

  const vector = data.data?.[0]?.embedding;
  if (!Array.isArray(vector)) throw new Error('Embedding response contained no vector');
  return vector;
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
