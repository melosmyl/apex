import { useCallback, useEffect, useRef, useState } from "react";

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

const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY;

// Cloudflare accepts a Turnstile token once, within 300s of issue. Replace
// it a little before that, so there's time left for the request to reach
// Supabase and Supabase to verify it.
const TOKEN_MAX_AGE_MS = 270_000;

export const CAPTCHA_RETRY_MESSAGE = "The security check didn't go through, so it's been refreshed. Please try again.";

// Supabase Auth has captcha protection on, so password login, signup,
// resend-code, forgot-password and the anonymous free meeting are all
// rejected without a valid Turnstile token. Render the widget with
// key={widgetKey} and onToken={setToken}, gate submit on `ready`, and get
// the token for a request from take(). Without a site key (local dev before
// Turnstile is set up) there's nothing to wait for.
//
// A widget can keep showing "Success" while its token is no longer usable:
// Turnstile's own expiry timer runs late in a background tab, so a form left
// open got "invalid-input-response" back from Supabase. So the token's age
// is tracked here, it's replaced before it can expire (and on returning to
// the tab), and take() never hands out a stale or already-used one.
export function useCaptcha() {
  const [token, setTokenState] = useState(null);
  const [widgetKey, setWidgetKey] = useState(0);
  const issuedAt = useRef(0);

  const setToken = useCallback((t) => {
    issuedAt.current = t ? Date.now() : 0;
    setTokenState(t || null);
  }, []);

  // Remounts the widget for a fresh token.
  const reset = useCallback(() => {
    issuedAt.current = 0;
    setTokenState(null);
    setWidgetKey((k) => k + 1);
  }, []);

  useEffect(() => {
    if (!token) return;
    const isStale = () => Date.now() - issuedAt.current >= TOKEN_MAX_AGE_MS;
    const timer = setTimeout(reset, Math.max(0, TOKEN_MAX_AGE_MS - (Date.now() - issuedAt.current)));
    // Timers in a background tab can fire minutes late — check on return.
    const onVisible = () => { if (document.visibilityState === "visible" && isStale()) reset(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearTimeout(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [token, reset]);

  // Hands the token to exactly one request: the widget resets the moment
  // it's taken, so it can never be sent twice and the next attempt already
  // has a fresh token on the way. Returns null — after asking for a fresh
  // one — if there's no token or it's too old to send, and undefined when
  // Turnstile isn't configured.
  const take = useCallback(() => {
    if (!SITE_KEY) return undefined;
    const usable = token && Date.now() - issuedAt.current < TOKEN_MAX_AGE_MS ? token : null;
    reset();
    return usable;
  }, [token, reset]);

  return { token, setToken, widgetKey, reset, take, ready: !SITE_KEY || !!token };
}
