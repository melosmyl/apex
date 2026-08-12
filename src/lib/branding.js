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
