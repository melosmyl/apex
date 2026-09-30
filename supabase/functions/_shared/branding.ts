// Backend twin of src/lib/branding.js — Deno edge functions and the Vite
// frontend don't share a module graph in this codebase, so a rename changes
// this file, branding.js and index.html's static tags, not a scattered
// find-and-replace. Only the product's actual self-naming lives here —
// generic descriptive phrases like "AI Advisory Board" (the fallback
// document-author label when no specific advisor name is given) are a
// description of what kind of board it is, not the product introducing
// itself, so they're deliberately left alone by the rename this constant
// was introduced for.
export const PRODUCT_NAME = 'Just Ask The Room';

// Public site URL, from the SITE_URL edge function secret. Nothing reads it
// yet — no function builds links or sends email today — so the first one
// that does has a single place to get it from rather than hardcoding one.
export const SITE_URL = (Deno.env.get('SITE_URL') ?? '').replace(/\/+$/, '');
