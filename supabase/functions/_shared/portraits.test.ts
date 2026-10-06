// Workstream K5: every advisor with a portrait in the manifest has all four
// files, and every slug is a real library advisor's.
import { assert, assertEquals } from 'jsr:@std/assert@1';
import { ADVISOR_LIBRARY } from '../../../src/lib/advisorLibrary.js';
import { PORTRAIT_SLUGS } from '../../../src/lib/portraitManifest.js';

const ROOT = new URL('../../../', import.meta.url);

Deno.test('every library advisor has a unique portrait slug', () => {
  const slugs = ADVISOR_LIBRARY.map((a: { portrait_slug: string }) => a.portrait_slug);
  assertEquals(new Set(slugs).size, ADVISOR_LIBRARY.length);
  for (const s of slugs) assert(/^[a-z0-9]+(-[a-z0-9]+)*$/.test(s), s);
});

Deno.test('every listed portrait has its four files, and belongs to a library advisor', async () => {
  const library = new Set(ADVISOR_LIBRARY.map((a: { portrait_slug: string }) => a.portrait_slug));
  for (const slug of PORTRAIT_SLUGS) {
    assert(library.has(slug), `${slug} isn't a library advisor`);
    for (const suffix of ['avatar', 'avatar@2x', 'card', 'full']) {
      const info = await Deno.stat(new URL(`public/advisors/${slug}-${suffix}.jpg`, ROOT));
      assert(info.size > 1000, `${slug}-${suffix}.jpg is empty`);
    }
  }
});
