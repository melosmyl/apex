import { assertEquals } from 'jsr:@std/assert@1';
import { loadModelRegistry, resolveApprovedModels } from './modelRegistry.ts';

function fakeDb(rows: unknown[] | null, error: string | null = null) {
  return {
    from: () => ({
      select: () => ({
        eq: () => Promise.resolve({ data: rows, error: error ? { message: error } : null }),
      }),
    }),
  };
}

const ROWS = [
  { provider: 'openai', model_name: 'gpt-4o', is_provider_default: true },
  { provider: 'openai', model_name: 'gpt-4o-mini', is_provider_default: false },
  { provider: 'anthropic', model_name: 'claude-sonnet-5', is_provider_default: true },
  { provider: 'anthropic', model_name: 'claude-sonnet-5-5', is_provider_default: false },
];

Deno.test('an approved model and fallback pass through unchanged', async () => {
  const r = await loadModelRegistry(fakeDb(ROWS));
  const { primary, fallback } = resolveApprovedModels(r,
    { provider: 'anthropic', model: 'claude-sonnet-5-5' }, { provider: 'openai', model: 'gpt-4o' });
  assertEquals(primary, { provider: 'anthropic', model: 'claude-sonnet-5-5' });
  assertEquals(fallback, { provider: 'openai', model: 'gpt-4o' });
});

Deno.test('an unapproved model becomes its provider default', async () => {
  const r = await loadModelRegistry(fakeDb(ROWS));
  const { primary } = resolveApprovedModels(r, { provider: 'openai', model: 'o9-ultra-expensive' }, {});
  assertEquals(primary, { provider: 'openai', model: 'gpt-4o' });
});

Deno.test('an unapproved fallback becomes the other provider default', async () => {
  const r = await loadModelRegistry(fakeDb(ROWS));
  const { fallback } = resolveApprovedModels(r,
    { provider: 'openai', model: 'gpt-4o' }, { provider: 'anthropic', model: 'claude-mythos-9' });
  assertEquals(fallback, { provider: 'anthropic', model: 'claude-sonnet-5' });
});

Deno.test('an unknown provider gets an approved default', async () => {
  const r = await loadModelRegistry(fakeDb(ROWS));
  const { primary } = resolveApprovedModels(r, { provider: 'madeup', model: 'x' }, {});
  assertEquals(r.isApproved(primary.provider, primary.model), true);
});

Deno.test('a newly registered model is approved without a code change', async () => {
  const r = await loadModelRegistry(fakeDb([...ROWS, { provider: 'anthropic', model_name: 'claude-fable-5-1', is_provider_default: false }]));
  assertEquals(r.isApproved('anthropic', 'claude-fable-5-1'), true);
});

Deno.test('an unreadable registry falls back to the long-standing models only', async () => {
  const r = await loadModelRegistry(fakeDb(null, 'column does not exist'));
  assertEquals(r.isApproved('openai', 'gpt-4o'), true);
  assertEquals(r.isApproved('anthropic', 'claude-sonnet-5'), true);
  assertEquals(r.isApproved('anthropic', 'claude-fable-5-1'), false);
});
