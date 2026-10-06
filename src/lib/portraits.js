import { ADVISOR_LIBRARY } from "@/lib/advisorLibrary";
import { PORTRAIT_SLUGS } from "@/lib/portraitManifest";

// Advisor portraits (Workstream K5), imported into public/advisors/ by
// scripts/import-portraits.mjs. A library advisor is found by key or, where
// only a name is known (transcripts, the share page, task owners), by name.
// Custom advisors a founder created, and anyone without an imported
// portrait, get null: callers show initials instead.
const AVAILABLE = new Set(PORTRAIT_SLUGS);
const BY_KEY = new Map(ADVISOR_LIBRARY.map((a) => [a.key, a.portrait_slug]));
const BY_NAME = new Map(ADVISOR_LIBRARY.map((a) => [a.name.toLowerCase(), a.portrait_slug]));

export function portraitFor({ libraryKey, name } = {}) {
  const slug = (libraryKey && BY_KEY.get(libraryKey)) || (name && BY_NAME.get(String(name).trim().toLowerCase()));
  if (!slug || !AVAILABLE.has(slug)) return null;
  return {
    avatar: `/advisors/${slug}-avatar.jpg`, // 96×96, face crop
    avatar2x: `/advisors/${slug}-avatar@2x.jpg`, // 192×192, same crop
    card: `/advisors/${slug}-card.jpg`, // 400 wide, whole portrait
    full: `/advisors/${slug}-full.jpg`, // 1024 on the long side
  };
}
