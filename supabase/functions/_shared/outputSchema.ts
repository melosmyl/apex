// The answer shapes callers ask for, converted for each provider's native
// structured output, plus the checks on what comes back.
//
// Callers write plain JSON Schema (type/properties/required/items/enum/
// description). OpenAI's strict json_schema wants every property required,
// so an optional one becomes "required but may be null". Anthropic's
// output_config.format allows optional properties but caps them (24) and
// union-typed fields (16). Both want additionalProperties: false on every
// object. Meeting schemas are written with every field required ("none" is
// an empty list or an empty string), so both providers see the same shape.

// deno-lint-ignore no-explicit-any
type Schema = any;

// Keywords neither provider's structured output accepts; dropped, not sent.
const UNSUPPORTED = ['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf',
  'minLength', 'maxLength', 'minItems', 'maxItems', 'uniqueItems', 'pattern', 'default'];

export const ANTHROPIC_LIMITS = { optional: 24, unions: 16 };

function clean(node: Schema, nullableOptional: boolean): Schema {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return node;
  const out: Schema = {};
  // x- keys are ours (x-core), never sent to a provider.
  for (const [k, v] of Object.entries(node)) if (!UNSUPPORTED.includes(k) && !k.startsWith('x-')) out[k] = v;
  if (out.items) out.items = clean(out.items, nullableOptional);
  if (out.type === 'object' || out.properties) {
    out.type = 'object';
    const props: Record<string, Schema> = {};
    const required = new Set<string>(Array.isArray(out.required) ? out.required : []);
    for (const [name, child] of Object.entries(out.properties || {})) {
      let c = clean(child, nullableOptional);
      if (nullableOptional && !required.has(name)) c = nullable(c);
      props[name] = c;
    }
    out.properties = props;
    out.required = nullableOptional ? Object.keys(props) : Object.keys(props).filter((n) => required.has(n));
    out.additionalProperties = false;
  }
  return out;
}

function nullable(node: Schema): Schema {
  const out = { ...node };
  if (Array.isArray(out.type)) { if (!out.type.includes('null')) out.type = [...out.type, 'null']; }
  else if (out.type) out.type = [out.type, 'null'];
  if (Array.isArray(out.enum) && !out.enum.includes(null)) out.enum = [...out.enum, null];
  return out;
}

export function forOpenAI(schema: Schema): Schema { return clean(schema, true); }
export function forAnthropic(schema: Schema): Schema { return clean(schema, false); }

// How many optional and union-typed fields a schema has, counted the way
// Anthropic's limits count them.
export function anthropicSchemaStats(schema: Schema) {
  let optional = 0, unions = 0;
  const walk = (node: Schema) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node.type) && node.type.length > 1) unions++;
    if (Array.isArray(node.anyOf)) { unions++; node.anyOf.forEach(walk); }
    if (node.properties) {
      const required = new Set(node.required || []);
      for (const [name, child] of Object.entries(node.properties)) {
        if (!required.has(name)) optional++;
        walk(child);
      }
    }
    if (node.items) walk(node.items);
  };
  walk(schema);
  return { optional, unions };
}

export function fitsAnthropicLimits(schema: Schema): boolean {
  const s = anthropicSchemaStats(forAnthropic(schema));
  return s.optional <= ANTHROPIC_LIMITS.optional && s.unions <= ANTHROPIC_LIMITS.unions;
}

// The prompt text for providers that get the schema pasted instead.
export function pastedSchemaText(schema: Schema): string {
  return `\n\nJSON structure:\n${JSON.stringify(schema, null, 2)}`;
}

// Fixes what a pasted-schema answer gets wrong in harmless ways: an enum
// value in the wrong case ("Challenge" for "challenge"). Native structured
// output never needs it.
function normalizeEnums(value: unknown, schema: Schema): unknown {
  if (!schema || typeof schema !== 'object' || value == null) return value;
  if (Array.isArray(schema.enum) && typeof value === 'string' && !schema.enum.includes(value)) {
    const match = schema.enum.find((e: unknown) => typeof e === 'string' && e.toLowerCase() === value.trim().toLowerCase());
    return match ?? value;
  }
  if (Array.isArray(value) && schema.items) return value.map((v) => normalizeEnums(v, schema.items));
  if (typeof value === 'object' && schema.properties) {
    const out: Record<string, unknown> = { ...(value as Record<string, unknown>) };
    for (const [k, child] of Object.entries(schema.properties)) if (k in out) out[k] = normalizeEnums(out[k], child);
    return out;
  }
  return value;
}

// reason: null when valid, else 'no_text_block' | 'invalid_json' | 'missing_fields'
// (with the missing field names) — recorded per attempt in ai_usage_logs.attempts.
// A pasted schema isn't enforced, so a pasted-mode answer is held only to
// the schema's core fields (x-core, the fields that were always required);
// other fields it leaves out are filled with their default or an empty value.
function fillOptional(obj: Record<string, unknown>, schema: Schema) {
  for (const [k, p] of Object.entries((schema?.properties || {}) as Record<string, Schema>)) {
    if (obj[k] !== undefined && obj[k] !== null) continue;
    if (p.default !== undefined) obj[k] = p.default;
    else if (p.type === 'array') obj[k] = [];
    else if (p.type === 'string' && !p.enum) obj[k] = '';
  }
}

export function validateAndParse(content: string | null, schema: Schema, lenient = false) {
  if (!content) return { parsed: null, valid: false, reason: 'no_text_block' as const };
  let parsed: unknown = null;
  try { parsed = JSON.parse(content); }
  catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) return { parsed: null, valid: false, reason: 'invalid_json' as const };
    try { parsed = JSON.parse(match[0]); } catch { return { parsed: null, valid: false, reason: 'invalid_json' as const }; }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { parsed: null, valid: false, reason: 'invalid_json' as const };
  const obj = normalizeEnums(parsed, schema) as Record<string, unknown>;
  const core = lenient && Array.isArray(schema?.['x-core']) ? schema['x-core'] : null;
  if (core) fillOptional(obj, schema);
  const missing = ((core || schema?.required || []) as string[]).filter((f) => obj[f] === undefined || obj[f] === null);
  if (missing.length) return { parsed: obj, valid: false, reason: 'missing_fields' as const, missing };
  return { parsed: obj, valid: true, reason: null };
}
