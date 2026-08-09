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
