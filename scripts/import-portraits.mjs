#!/usr/bin/env node
// Imports the advisor portraits (Workstream K5) as web-sized app assets.
//
//   node scripts/import-portraits.mjs [source folder]   (default ~/Documents/apex-portraits)
//
// Each source file is matched to a library advisor by name ("Dr. Aris Chen.png"
// or "aris-chen.jpg" both work) and written to public/advisors/ in three sizes:
//   <slug>-avatar.jpg     96×96, cropped to the face, for small avatars
//   <slug>-avatar@2x.jpg  192×192, the same crop, for high-density screens
//                         and larger avatars
//   <slug>-card.jpg    400 wide, the whole portrait, for cards and profiles
//   <slug>-full.jpg    1024 on the long side, for full-size views
// Files that aren't an advisor (the group images) are skipped. Re-running
// with a new file for the same advisor (e.g. the mug-lettered versions)
// replaces it everywhere: the app always asks for the same file names.
// Uses macOS's built-in `sips`; no extra dependency.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ADVISOR_LIBRARY } from '../src/lib/advisorLibrary.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = path.resolve(process.argv[2] || path.join(os.homedir(), 'Documents', 'apex-portraits'));
const OUT = path.join(ROOT, 'public', 'advisors');
const MANIFEST = path.join(ROOT, 'src', 'lib', 'portraitManifest.js');
const QUALITY = '82';

// Where the face sits, as fractions of the portrait: the avatar is a square
// of AVATAR_SIDE × width, centred FACE_Y down from the top. One advisor can
// override it here if their crop ever looks off.
const FACE_Y = 0.36;
const AVATAR_SIDE = 0.6;
const WIDER_SHOT = { side: 0.46 }; // portraits taken from further back
const CROP_OVERRIDES = {
  'amara-vance': WIDER_SHOT, 'aris-chen': WIDER_SHOT, 'daniel-okoye': WIDER_SHOT, 'priya-nair': WIDER_SHOT,
  'tomas-berg': WIDER_SHOT, 'sofia-marchetti': WIDER_SHOT, 'marcus-delgado': WIDER_SHOT,
  'margaret-ashworth': WIDER_SHOT, 'grace-bennett': WIDER_SHOT,
  'victor-hale': { side: 0.48, faceY: 0.41 },
};

const toSlug = (name) => name.replace(/^dr\.?\s+/i, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const bySlug = new Map(ADVISOR_LIBRARY.map((a) => [a.portrait_slug, a]));

function sips(args) {
  execFileSync('sips', args, { stdio: ['ignore', 'ignore', 'pipe'] });
}
function size(file) {
  const out = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', file]).toString();
  return { w: Number(out.match(/pixelWidth: (\d+)/)[1]), h: Number(out.match(/pixelHeight: (\d+)/)[1]) };
}

fs.mkdirSync(OUT, { recursive: true });
const imported = [];
const skipped = [];
// One source file per advisor. When there are two (an old and a new export),
// the one already named by slug ("victor-hale.png") wins, else the newest.
const chosen = new Map();
for (const file of fs.readdirSync(SOURCE).sort()) {
  if (!/\.(png|jpe?g|heic|webp)$/i.test(file)) continue;
  const slug = toSlug(path.parse(file).name);
  if (!bySlug.has(slug)) { skipped.push(file); continue; }
  const rank = (f) => [path.parse(f).name === slug ? 1 : 0, fs.statSync(path.join(SOURCE, f)).mtimeMs];
  const current = chosen.get(slug);
  if (current) {
    const [a, b] = [rank(file), rank(current)];
    const keep = a[0] !== b[0] ? (a[0] > b[0] ? file : current) : (a[1] > b[1] ? file : current);
    console.log(`Two files for ${slug}: using "${keep}", ignoring "${keep === file ? current : file}".`);
    chosen.set(slug, keep);
  } else chosen.set(slug, file);
}
for (const [slug, file] of [...chosen].sort()) {
  const src = path.join(SOURCE, file);
  const { w, h } = size(src);
  const crop = { faceY: FACE_Y, side: AVATAR_SIDE, ...CROP_OVERRIDES[slug] };
  const side = Math.min(Math.round(w * crop.side), h);
  const top = Math.max(0, Math.min(h - side, Math.round(h * crop.faceY - side / 2)));
  const left = Math.round((w - side) / 2);
  const jpeg = ['-s', 'format', 'jpeg', '-s', 'formatOptions', QUALITY];

  // Crop and resize in two passes: sips applies a resize before a crop when
  // both are given at once.
  const avatar = path.join(OUT, `${slug}-avatar.jpg`);
  const avatar2x = path.join(OUT, `${slug}-avatar@2x.jpg`);
  sips([...jpeg, '-c', String(side), String(side), '--cropOffset', String(top), String(left), src, '--out', avatar2x]);
  fs.copyFileSync(avatar2x, avatar);
  sips(['-z', '192', '192', avatar2x]);
  sips(['-z', '96', '96', avatar]);
  sips([...jpeg, '--resampleWidth', '400', src, '--out', path.join(OUT, `${slug}-card.jpg`)]);
  sips([...jpeg, '-Z', String(Math.min(1024, Math.max(w, h))), src, '--out', path.join(OUT, `${slug}-full.jpg`)]);
  imported.push(slug);
}

// Portraits from an earlier import whose source is still missing stay listed
// only if their files are still there.
const onDisk = new Set(fs.readdirSync(OUT).filter((f) => f.endsWith('-avatar.jpg')).map((f) => f.replace('-avatar.jpg', '')));
const all = [...new Set([...imported, ...onDisk])].filter((s) => bySlug.has(s)).sort();
fs.writeFileSync(MANIFEST, `// Generated by scripts/import-portraits.mjs: the advisors who have a portrait
// in public/advisors/. Don't edit by hand; re-run the script instead.
export const PORTRAIT_SLUGS = ${JSON.stringify(all, null, 2)};
`);

const missing = ADVISOR_LIBRARY.filter((a) => !all.includes(a.portrait_slug)).map((a) => a.name);
console.log(`Imported ${imported.length}: ${imported.join(', ')}`);
if (skipped.length) console.log(`Skipped (not an advisor): ${skipped.join(', ')}`);
console.log(`${all.length} of ${ADVISOR_LIBRARY.length} advisors have a portrait.${missing.length ? ` Still initials: ${missing.join(', ')}` : ''}`);
