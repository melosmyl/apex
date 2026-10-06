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

Deno.test("an unapproved model becomes the advisor's own default, and the swap is described", async () => {
  const r = await loadModelRegistry(fakeDb(ROWS));
  const advisorDefault = { primary: { provider: 'anthropic', model: 'claude-sonnet-5' }, fallback: { provider: 'openai', model: 'gpt-4o' } };
  const { primary, fallback, substitution } = resolveApprovedModels(r,
    { provider: 'openai', model: 'o9-ultra-expensive' }, { provider: 'openai', model: 'gpt-9' }, advisorDefault);
  assertEquals(primary, { provider: 'anthropic', model: 'claude-sonnet-5' });
  assertEquals(fallback, { provider: 'openai', model: 'gpt-4o' });
  assertEquals(substitution, "openai/o9-ultra-expensive -> anthropic/claude-sonnet-5 (advisor's default); fallback openai/gpt-9 -> openai/gpt-4o (advisor's backup)");
});

Deno.test('no substitution note when nothing was swapped', async () => {
  const r = await loadModelRegistry(fakeDb(ROWS));
  const { substitution } = resolveApprovedModels(r, { provider: 'openai', model: 'gpt-4o' }, { provider: 'anthropic', model: 'claude-sonnet-5' });
  assertEquals(substitution, null);
});

Deno.test('a registry with no default never lets an unapproved model through', async () => {
  const r = await loadModelRegistry(fakeDb([{ provider: 'openai', model_name: 'gpt-4o-mini', is_provider_default: false, purpose: 'cheap_tier' }]));
  const { primary } = resolveApprovedModels(r, { provider: 'openai', model: 'o1-pro' }, {});
  assertEquals(primary, { provider: 'openai', model: 'gpt-4o' });
});

Deno.test('a model registered for another purpose is not selectable by advisor rows', async () => {
  const r = await loadModelRegistry(fakeDb([...ROWS, { provider: 'anthropic', model_name: 'claude-opus-5-5', is_provider_default: false, purpose: 'chair' }]));
  assertEquals(r.isApproved('anthropic', 'claude-opus-5-5'), false);
  assertEquals(r.isApproved('anthropic', 'claude-sonnet-5'), true);
});

Deno.test('switching the primary model off never makes the fallback run the same model', async () => {
  // Claude switched off by an admin: the only active models are OpenAI's.
  const r = await loadModelRegistry(fakeDb([{ provider: 'openai', model_name: 'gpt-4o', is_provider_default: true }]));
  const { primary, fallback, substitution } = resolveApprovedModels(r,
    { provider: 'anthropic', model: 'claude-sonnet-5' }, { provider: 'openai', model: 'gpt-4o' });
  assertEquals(primary, { provider: 'openai', model: 'gpt-4o' });
  assertEquals(fallback, null);
  assertEquals(substitution, 'anthropic/claude-sonnet-5 -> openai/gpt-4o (registry default); fallback openai/gpt-4o is the primary -> none');
});

Deno.test('a fallback that lands on the primary moves to the other provider', async () => {
  const rows = [
    { provider: 'openai', model_name: 'gpt-4o', is_provider_default: true },
    { provider: 'anthropic', model_name: 'claude-sonnet-5-5', is_provider_default: true },
  ];
  const r = await loadModelRegistry(fakeDb(rows));
  const { primary, fallback } = resolveApprovedModels(r,
    { provider: 'anthropic', model: 'claude-sonnet-5' }, { provider: 'anthropic', model: 'claude-sonnet-5-5' });
  assertEquals(primary, { provider: 'anthropic', model: 'claude-sonnet-5-5' });
  assertEquals(fallback, { provider: 'openai', model: 'gpt-4o' });
});
