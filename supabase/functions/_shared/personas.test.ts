// Workstream K2: the advisor personas. Guards what the character sheet's
// house rules forbid, and keeps the server's built-in Chair identical to the
// library's Chair.
import { assert, assertEquals } from 'jsr:@std/assert@1';
import { ADVISOR_LIBRARY, ADVISOR_PROVIDER_CONFIG } from '../../../src/lib/advisorLibrary.js';
import { BUILT_IN_CHAIR } from './chair.ts';

const CONFIG = ADVISOR_PROVIDER_CONFIG as Record<string, { system_instructions: string; default_provider: string; default_model: string }>;

// Nobody in the product ever remarks on the advisors being cats, and nothing
// references a real person, company or brand.
const FORBIDDEN = /\b(cats?|kittens?|feline|purr\w*|paws?|whiskers?|meow|tabby|breed)\b|\b(Elon|Musk|Buffett|Bezos|Rubin|Berkshire|Amazon|Tesla|SpaceX|Ogilvy|Susan Cain)\b|Day one|Day 1\b|press release/i;

Deno.test('every library advisor has a persona and profile line within the house rules', () => {
  assertEquals(ADVISOR_LIBRARY.length, 22);
  for (const a of ADVISOR_LIBRARY) {
    const persona = CONFIG[a.key]?.system_instructions || '';
    assert(persona.startsWith(`You are ${a.name}, `), `${a.key}: persona should open with the advisor's name`);
    assert(!FORBIDDEN.test(persona), `${a.key}: persona breaks a house rule: ${persona.match(FORBIDDEN)?.[0]}`);
    assert(!FORBIDDEN.test(a.biography), `${a.key}: profile line breaks a house rule: ${a.biography.match(FORBIDDEN)?.[0]}`);
    const words = persona.split(/\s+/).length;
    assert(words >= 80 && words <= 220, `${a.key}: persona is ${words} words`);
  }
});

Deno.test('the built-in Chair is the library Chair, word for word', () => {
  const lib = ADVISOR_LIBRARY.find((a) => a.key === 'chair')!;
  const cfg = ADVISOR_PROVIDER_CONFIG.chair;
  assertEquals(BUILT_IN_CHAIR.name, lib.name);
  assertEquals(BUILT_IN_CHAIR.role, lib.role);
  assertEquals(BUILT_IN_CHAIR.biography, lib.biography);
  assertEquals(BUILT_IN_CHAIR.system_instructions, cfg.system_instructions);
  assertEquals(BUILT_IN_CHAIR.decision_style, lib.decision_style);
  assertEquals(BUILT_IN_CHAIR.communication_style, lib.communication_style);
  assertEquals(BUILT_IN_CHAIR.strengths, lib.strengths);
  assertEquals(BUILT_IN_CHAIR.weaknesses, lib.weaknesses);
  assertEquals([BUILT_IN_CHAIR.default_provider, BUILT_IN_CHAIR.default_model], [cfg.default_provider, cfg.default_model]);
});

Deno.test("the Chair's persona keeps her out of the debate", () => {
  const persona = ADVISOR_PROVIDER_CONFIG.chair.system_instructions;
  assert(/don't debate/.test(persona) && /write the resolution/.test(persona));
});
