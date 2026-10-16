import { assert } from 'jsr:@std/assert@1';

// The Chair's instructions travel as system_instructions, which
// advisorPrompt.ts cuts at 6,000 characters: anything past that is silently
// lost. Longer rules go in the meeting context (RESOLUTION_RULES, TURN_CHECKS).
Deno.test("the Chair's instructions fit within what reaches the model", async () => {
  const src = await Deno.readTextFile(new URL('../runChairSynthesis/index.ts', import.meta.url));
  const start = src.indexOf('const CHAIR_INSTRUCTIONS = `');
  const text = src.slice(start + 'const CHAIR_INSTRUCTIONS = `'.length, src.indexOf('`;', start));
  assert(start > 0 && text.length <= 6000, `CHAIR_INSTRUCTIONS is ${text.length} characters`);
  const cap = await Deno.readTextFile(new URL('./advisorPrompt.ts', import.meta.url));
  assert(cap.includes(', 6000)'), 'the instructions cap changed: update this test');
});
