// Single source of truth for user-facing names — anywhere the product or
// its assistant names itself to a real visitor should import from here
// rather than hardcoding a string, so a future rename is a one-line change,
// not a find-and-replace across the codebase. The repo, the Supabase
// project, and internal identifiers are deliberately NOT renamed alongside
// this — only what a user actually sees.
export const PRODUCT_NAME = "Nobody Told Sandra";
export const PRODUCT_DOMAIN = "nobodytoldsandra.com";

// Persona/name for the Assistant is explicitly undecided (product owner,
// 2026-08-12) — this placeholder exists so renaming her later is a one-line
// change here, not a find-and-replace across the codebase.
export const ASSISTANT_NAME = "The Assistant";

// The landing and auth pages carry a deliberately separate identity accent
// (deep indigo) from the rest of the product (amber, --brand in index.css).
// Applied as a scoped CSS custom-property override on those pages' root
// element rather than a second global token, so `bg-brand`/`text-brand`/
// Button's variant="brand" resolve to indigo only within that subtree —
// the app interior stays amber-only without per-component changes there.
export const IDENTITY_ACCENT_STYLE = {
  "--brand": "234 58% 38%",
  "--brand-foreground": "40 20% 98%",
  "--brand-soft": "234 45% 93%",
  "--ring": "234 55% 45%",
};
