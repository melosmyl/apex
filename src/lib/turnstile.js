// Cloudflare's published Turnstile test site keys — fixed, documented
// values (https://developers.cloudflare.com/turnstile/troubleshooting/testing/),
// never assigned to a real site. A live site key can never equal one of
// these, so any of them showing up in a production build means Turnstile
// is misconfigured, not just slow to load — bot protection would be
// silently disabled on the free anonymous meeting.
const TEST_SITE_KEYS = new Set([
  "1x00000000000000000000AA", // always passes
  "2x00000000000000000000AB", // always blocks
  "3x00000000000000000000FF", // forces an interactive challenge
]);

// Called once at module load (see TurnstileWidget.jsx), not per-render —
// a misconfigured production build should fail immediately and visibly,
// not only once a visitor happens to reach the free-meeting page.
export function assertLiveSiteKeyInProduction(siteKey) {
  if (!import.meta.env.PROD) return;
  if (!siteKey || TEST_SITE_KEYS.has(siteKey)) {
    throw new Error(
      "Turnstile misconfiguration: this production build has a Cloudflare test site key (or none at all) in VITE_TURNSTILE_SITE_KEY. Refusing to render rather than silently disabling bot protection."
    );
  }
}
