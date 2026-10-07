// Single source of truth for user-facing names — anywhere the product or
// its assistant names itself to a real visitor should import from here
// rather than hardcoding a string. A rename touches this file, its backend
// twin (supabase/functions/_shared/branding.ts), and index.html, whose
// <title>, description, OG and canonical tags are static and can't import
// this module. The repo, the Supabase project, and internal identifiers are
// deliberately NOT renamed alongside this — only what a user actually sees.
export const PRODUCT_NAME = "Just Ask The Room";
export const PRODUCT_DOMAIN = "justasktheroom.com";
export const SUPPORT_EMAIL = "hello@justasktheroom.com";

// Public URL for anything a user leaves the page with — share links and
// auth email/OAuth redirects. Set VITE_SITE_URL per environment (production
// domain on Vercel, http://localhost:5173 in .env.local); where it's unset,
// such as Vercel preview deploys, links follow the origin the page is on.
export const SITE_URL = (import.meta.env.VITE_SITE_URL || window.location.origin).replace(/\/+$/, "");

// Persona/name for the Assistant is explicitly undecided (product owner,
// 2026-08-12) — this placeholder exists so renaming her later is a one-line
// change here, not a find-and-replace across the codebase.
export const ASSISTANT_NAME = "The Assistant";

// D1: shown wherever an advisor is presented (profiles, the advisors pages).
// The owner's wording; change it here only with their sign-off.
export const ADVISORS_ARE_AI = "Every advisor at Just Ask The Room is an AI character. Their backgrounds are invented, and their advice comes from AI models, not people. The decisions are yours.";
