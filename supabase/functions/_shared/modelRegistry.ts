// Which models may run, read from ai_model_configurations: the model
// registry. An active row whose purpose is 'advisor' (or unset) approves a
// model for advisor rows — rows registered for other purposes (cheap tier,
// a premium Chair model) can't be picked by founders editing their advisors; one active row per provider is
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

type Row = { provider: string; model_name: string; is_provider_default?: boolean; purpose?: string | null };

function build(rows: Row[]): ModelRegistry {
  const forAdvisors = rows.filter((r) => !r.purpose || r.purpose === 'advisor');
  const approved = new Set(forAdvisors.map((r) => `${r.provider}:${r.model_name}`));
  const defaults = new Map<string, ModelRef>();
  for (const r of forAdvisors) {
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
      .select('provider, model_name, is_provider_default, purpose').eq('is_active', true);
    if (error) throw new Error(error.message);
    if (data?.length) return build(data);
    console.error('Model registry has no active models; using the unreadable-registry fallback');
  } catch (e) {
    console.error('Model registry unreadable; using the fallback:', (e as Error).message);
  }
  return build(UNREADABLE_REGISTRY_FALLBACK.map((m) => ({ provider: m.provider, model_name: m.model, is_provider_default: true })));
}

// An advisor's own default model and backup, from advisor_model_defaults,
// keyed by library_key. Custom advisors have none.
export type AdvisorDefault = { primary: ModelRef; fallback: ModelRef | null } | null;

export async function loadAdvisorDefault(db: Db, libraryKey: string | null | undefined): Promise<AdvisorDefault> {
  if (!libraryKey) return null;
  try {
    const { data } = await db.from('advisor_model_defaults')
      .select('provider, model_name, fallback_provider, fallback_model').eq('library_key', libraryKey).maybeSingle();
    if (!data) return null;
    return {
      primary: { provider: data.provider, model: data.model_name },
      fallback: data.fallback_provider && data.fallback_model ? { provider: data.fallback_provider, model: data.fallback_model } : null,
    };
  } catch {
    return null;
  }
}

// The primary and fallback a call may actually use, given what the advisor
// row asks for. An unapproved primary becomes, in order: the advisor's own
// default, its provider's default, any provider's default. An unapproved
// fallback becomes the advisor's own backup, else the default of a
// different provider from the primary, else none. Every swap is described
// in `substitution` so the caller can log it.
export function resolveApprovedModels(
  registry: ModelRegistry,
  requested: ModelRef,
  requestedFallback: Partial<ModelRef>,
  advisorDefault: AdvisorDefault = null,
) {
  const notes: string[] = [];
  const approved = (m: ModelRef | null | undefined): boolean => !!m && registry.isApproved(m.provider, m.model);

  let primary = requested;
  if (!approved(primary)) {
    const providerDefault = registry.defaultFor(primary.provider);
    // Never let an unapproved model through: with no approved default at
    // all, fall back to the long-standing models.
    const [replacement, source]: [ModelRef, string] = approved(advisorDefault?.primary) ? [advisorDefault!.primary, "advisor's default"]
      : approved(providerDefault) ? [providerDefault!, 'provider default']
      : registry.anyDefault() ? [registry.anyDefault()!, 'registry default']
      : [UNREADABLE_REGISTRY_FALLBACK.find((m) => m.provider === primary.provider) ?? UNREADABLE_REGISTRY_FALLBACK[0], 'built-in fallback'];
    notes.push(`${primary.provider}/${primary.model} -> ${replacement.provider}/${replacement.model} (${source})`);
    primary = replacement;
  }

  let fallback: ModelRef | null = null;
  if (requestedFallback.provider && requestedFallback.model) {
    const asked = { provider: requestedFallback.provider, model: requestedFallback.model };
    if (approved(asked)) {
      fallback = asked;
    } else {
      const other = ['openai', 'anthropic'].find((p) => p !== primary.provider && registry.defaultFor(p));
      const [replacement, source]: [ModelRef | null, string] = approved(advisorDefault?.fallback) ? [advisorDefault!.fallback, "advisor's backup"]
        : other ? [registry.defaultFor(other), 'other provider default'] : [null, 'none'];
      fallback = replacement;
      notes.push(`fallback ${asked.provider}/${asked.model} -> ${replacement ? `${replacement.provider}/${replacement.model}` : 'none'} (${source})`);
    }
  }

  const substitution = notes.length ? notes.join('; ') : null;
  if (substitution) console.warn(`Model substitution: ${substitution}`);
  return { primary, fallback, substitution };
}
