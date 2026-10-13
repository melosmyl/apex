import { assertEquals } from 'jsr:@std/assert@1';
import { embedText } from './embeddings.ts';

Deno.test('embeddings go to OPENAI_BASE_URL when it is set, and to OpenAI when it is not', async () => {
  const seen: string[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = ((url: string) => {
    seen.push(String(url));
    return Promise.resolve(Response.json({ data: [{ embedding: [1, 0] }] }));
  }) as typeof fetch;
  const before = { key: Deno.env.get('OPENAI_API_KEY'), base: Deno.env.get('OPENAI_BASE_URL') };
  const restore = (name: string, value?: string) => value === undefined ? Deno.env.delete(name) : Deno.env.set(name, value);
  Deno.env.set('OPENAI_API_KEY', 'test-key');
  try {
    Deno.env.set('OPENAI_BASE_URL', 'http://127.0.0.1:54399/v1');
    await embedText('hello');
    Deno.env.delete('OPENAI_BASE_URL');
    await embedText('hello');
  } finally {
    globalThis.fetch = realFetch;
    restore('OPENAI_API_KEY', before.key);
    restore('OPENAI_BASE_URL', before.base);
  }
  assertEquals(seen, ['http://127.0.0.1:54399/v1/embeddings', 'https://api.openai.com/v1/embeddings']);
});
