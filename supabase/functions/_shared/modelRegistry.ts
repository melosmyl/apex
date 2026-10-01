// Which models may run, read from ai_model_configurations: the model
// registry. An active row approves a model; one active row per provider is
// marked is_provider_default and replaces any unapproved model an advisor
// row asks for. Adding a model (Sonnet 5.5, Fable 5.1, a new provider) is a
// row, not a code change.
//
// Workstream H3 extends this table and module (prices, output limits,
// thinking modes) without touching the ownership checks in access.ts.

// deno-lint-ignore no-explicit-any
type Db = any;

export type ModelRef = { provider: string; model: string };

export type ModelRegistry = {
  isApproved(provider: string, model: string): boolean;
  defaultFor(provider: string): ModelRef | null;
  anyDefault(): ModelRef | null;
};

// Used only if the registry can't be read at all, so a database hiccup
// degrades to the long-standing models rather than failing every call.
// It is not the approved list: any readable registry replaces it entirely.
const UNREADABLE_REGISTRY_FALLBACK: ModelRef[] = [
  { provider: 'openai', model: 'gpt-4o' },
  { provider: 'anthropic', model: 'claude-sonnet-5' },
];

function build(rows: { provider: string; model_name: string; is_provider_default?: boolean }[]): ModelRegistry {
  const approved = new Set(rows.map((r) => `${r.provider}:${r.model_name}`));
  const defaults = new Map<string, ModelRef>();
  for (const r of rows) {
    if (r.is_provider_default && !defaults.has(r.provider)) defaults.set(r.provider, { provider: r.provider, model: r.model_name });
  }
  return {
    isApproved: (provider, model) => approved.has(`${provider}:${model}`),
    defaultFor: (provider) => defaults.get(provider) ?? null,
    anyDefault: () => defaults.values().next().value ?? null,
  };
}

export async function loadModelRegistry(db: Db): Promise<ModelRegistry> {
  try {
    const { data, error } = await db.from('ai_model_configurations')
      .select('provider, model_name, is_provider_default').eq('is_active', true);
    if (error) throw new Error(error.message);
    if (data?.length) return build(data);
    console.error('Model registry has no active models; using the unreadable-registry fallback');
  } catch (e) {
    console.error('Model registry unreadable; using the fallback:', (e as Error).message);
  }
  return build(UNREADABLE_REGISTRY_FALLBACK.map((m) => ({ provider: m.provider, model_name: m.model, is_provider_default: true })));
}

// The primary and fallback a call may actually use, given what the advisor
// row asks for. An unapproved primary becomes its provider's default (or any
// provider's default); an unapproved fallback becomes the default of a
// different provider from the primary, or none.
export function resolveApprovedModels(registry: ModelRegistry, requested: ModelRef, requestedFallback: Partial<ModelRef>) {
  let primary = requested;
  if (!registry.isApproved(primary.provider, primary.model)) {
    const replacement = registry.defaultFor(primary.provider) ?? registry.anyDefault();
    console.warn(`Model ${primary.provider}/${primary.model} is not approved; using ${replacement?.provider}/${replacement?.model}`);
    if (replacement) primary = replacement;
  }
  let fallback: ModelRef | null = null;
  if (requestedFallback.provider && requestedFallback.model) {
    fallback = { provider: requestedFallback.provider, model: requestedFallback.model };
    if (!registry.isApproved(fallback.provider, fallback.model)) {
      const other = ['openai', 'anthropic'].find((p) => p !== primary.provider && registry.defaultFor(p));
      fallback = other ? registry.defaultFor(other) : null;
    }
  }
  return { primary, fallback };
}
