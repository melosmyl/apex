// Backend twin of src/lib/branding.js — Deno edge functions and the Vite
// frontend don't share a module graph in this codebase, so a future rename
// is a two-line change (this file + branding.js), not a scattered
// find-and-replace. Only the product's actual self-naming lives here —
// generic descriptive phrases like "AI Advisory Board" (the fallback
// document-author label when no specific advisor name is given) are a
// description of what kind of board it is, not the product introducing
// itself, so they're deliberately left alone by the rename this constant
// was introduced for.
export const PRODUCT_NAME = 'Nobody Told Sandra';
