import { assert, assertEquals } from 'jsr:@std/assert@1';
import { ANTHROPIC_LIMITS, anthropicSchemaStats, fitsAnthropicLimits, forAnthropic, forOpenAI, validateAndParse } from './outputSchema.ts';
import * as schemas from './answerSchemas.ts';

const ALL: Record<string, unknown> = {
  INDEPENDENT_SCHEMA: schemas.INDEPENDENT_SCHEMA, CHAIR_OPENING_SCHEMA: schemas.CHAIR_OPENING_SCHEMA,
  DISCUSSION_SCHEMA: schemas.DISCUSSION_SCHEMA, FOLLOWUP_SCHEMA: schemas.FOLLOWUP_SCHEMA,
  RESOLUTION_SCHEMA: schemas.RESOLUTION_SCHEMA, TASK_ACK_SCHEMA: schemas.TASK_ACK_SCHEMA,
  ONBOARDING_SCHEMA: schemas.ONBOARDING_SCHEMA, ADMIN_TEST_SCHEMA: schemas.ADMIN_TEST_SCHEMA,
};

// OpenAI strict mode: every object closed, every property required.
// deno-lint-ignore no-explicit-any
function strictProblems(node: any, path = '$'): string[] {
  if (!node || typeof node !== 'object') return [];
  const out: string[] = [];
  if (node.properties) {
    if (node.additionalProperties !== false) out.push(`${path}: additionalProperties`);
    const keys = Object.keys(node.properties).sort();
    if (JSON.stringify([...(node.required || [])].sort()) !== JSON.stringify(keys)) out.push(`${path}: required`);
    for (const [k, v] of Object.entries(node.properties)) out.push(...strictProblems(v, `${path}.${k}`));
  }
  if (node.items) out.push(...strictProblems(node.items, `${path}[]`));
  return out;
}

for (const [name, schema] of Object.entries(ALL)) {
  Deno.test(`${name} meets OpenAI's strict rules and Anthropic's limits, with every field required`, () => {
    assertEquals(strictProblems(forOpenAI(schema)), []);
    const stats = anthropicSchemaStats(forAnthropic(schema));
    assertEquals(stats, { optional: 0, unions: 0 });
    assert(fitsAnthropicLimits(schema));
    // Required as written, so the two providers are held to the same shape.
    assertEquals(forOpenAI(schema), forAnthropic(schema));
  });
}

Deno.test('Round 1 offers only the 13 profile fields, or "none"', () => {
  const pf = schemas.INDEPENDENT_SCHEMA.properties.missing_information.items.properties.profile_field;
  assertEquals(pf.enum.length, 14);
  assertEquals(pf.enum.at(-1), 'none');
  assertEquals(schemas.PROFILE_FIELD_KEYS.length, 13);
});

Deno.test('an optional field becomes required-but-nullable for OpenAI, and stays optional for Anthropic', () => {
  const s = { type: 'object', properties: { a: { type: 'string' }, b: { type: 'string', enum: ['x', 'y'] }, n: { type: 'number', minimum: 0 } }, required: ['a'] };
  const o = forOpenAI(s);
  assertEquals(o.required, ['a', 'b', 'n']);
  assertEquals(o.properties.b, { type: ['string', 'null'], enum: ['x', 'y', null] });
  assertEquals(o.properties.n, { type: ['number', 'null'] });
  const a = forAnthropic(s);
  assertEquals(a.required, ['a']);
  assertEquals(a.properties.n, { type: 'number' });
  assertEquals(anthropicSchemaStats(a), { optional: 2, unions: 0 });
});

Deno.test('a schema over Anthropic\'s optional-field limit is caught', () => {
  const props: Record<string, unknown> = {};
  for (let i = 0; i <= ANTHROPIC_LIMITS.optional; i++) props[`f${i}`] = { type: 'string' };
  assertEquals(fitsAnthropicLimits({ type: 'object', properties: props, required: [] }), false);
});

Deno.test('pasted-schema answers get enum case fixed, and missing fields reported', () => {
  const v = validateAndParse('{"message":"hi","message_type":"Challenge"}', schemas.DISCUSSION_SCHEMA);
  assertEquals(v.parsed?.message_type, 'challenge');
  assertEquals(v.reason, 'missing_fields');
  assertEquals(validateAndParse('no json here', schemas.TASK_ACK_SCHEMA).reason, 'invalid_json');
  assertEquals(validateAndParse('Sure! {"acknowledgment":"Done."}', schemas.TASK_ACK_SCHEMA).valid, true);
  assertEquals(validateAndParse(null, schemas.TASK_ACK_SCHEMA).reason, 'no_text_block');
});

Deno.test('a pasted-schema answer is held only to the core fields, the rest filled in', () => {
  const v = validateAndParse('{"message":"hi","message_type":"Challenge","confidence_score":60}', schemas.DISCUSSION_SCHEMA, true);
  assertEquals(v.valid, true);
  assertEquals(v.parsed, { message: 'hi', message_type: 'challenge', confidence_score: 60, reply_to_advisor: '', new_position: '',
    new_risks: [], answerable: true, agrees_with: '' });
  assertEquals(validateAndParse('{"message":"hi"}', schemas.DISCUSSION_SCHEMA, true).reason, 'missing_fields');
});

Deno.test('our own schema keys never reach a provider', () => {
  for (const s of Object.values(ALL)) {
    const text = JSON.stringify([forOpenAI(s), forAnthropic(s)]);
    assert(!text.includes('x-core') && !text.includes('"default"'));
  }
});
