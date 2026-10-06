// Workstream K1: the advisors are fictional. Fails if a real person's name,
// one of their companies, or a retired advisor name or key comes back in the
// app or server code. Applied migrations are history and aren't scanned.
import { assertEquals } from 'jsr:@std/assert@1';

const ROOT = new URL('../../../', import.meta.url);
const SCAN = ['src', 'supabase/functions', 'index.html'];
const SKIP = [/\/node_modules\//, /\/dist\//, /advisorNames\.test\.ts$/, /personas\.test\.ts$/]; // these two list the forbidden words
const FORBIDDEN = [
  /\bElon\b/, /\bMusk\b/, /\bBuffett\b/, /\bBezos\b/, /Rick Rubin/, /Marcus Chen/,
  /Berkshire/, /Blue Origin/, /Def Jam/, /\bSpaceX\b/, /\bTesla\b/, /\bAmazon\b/,
  /\belon_musk\b/, /\bwarren_buffett\b/, /\bjeff_bezos\b/, /\brick_rubin\b/, /["']cfo["']/,
];

async function* files(url: URL): AsyncGenerator<URL> {
  const info = await Deno.stat(url);
  if (info.isFile) { yield url; return; }
  for await (const entry of Deno.readDir(url)) {
    const child = new URL(entry.name + (entry.isDirectory ? '/' : ''), url.href.endsWith('/') ? url : url.href + '/');
    if (SKIP.some((s) => s.test(child.pathname))) continue;
    if (entry.isDirectory) yield* files(child);
    else if (/\.(jsx?|tsx?|html|json|md)$/.test(entry.name)) yield child;
  }
}

Deno.test('no real person, their company, or a retired advisor name or key in the code', async () => {
  const hits: string[] = [];
  for (const dir of SCAN) {
    for await (const file of files(new URL(dir, ROOT))) {
      const text = await Deno.readTextFile(file);
      text.split('\n').forEach((line, i) => {
        for (const re of FORBIDDEN) if (re.test(line)) hits.push(`${file.pathname.slice(ROOT.pathname.length)}:${i + 1} ${re}`);
      });
    }
  }
  assertEquals(hits, []);
});
