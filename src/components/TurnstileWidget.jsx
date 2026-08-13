import React, { useEffect, useRef } from "react";
import { assertLiveSiteKeyInProduction } from "@/lib/turnstile";

const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY;
assertLiveSiteKeyInProduction(SITE_KEY);

// Renders nothing until a site key is configured — lets this flow keep
// working in local/dev environments before Cloudflare Turnstile is set up,
// and starts protecting the moment VITE_TURNSTILE_SITE_KEY is added.
export default function TurnstileWidget({ onToken }) {
  const ref = useRef(null);
  const widgetId = useRef(null);

  useEffect(() => {
    if (!SITE_KEY) return;
    const renderWidget = () => {
      if (!ref.current || !window.turnstile) return;
      widgetId.current = window.turnstile.render(ref.current, {
        sitekey: SITE_KEY,
        callback: (token) => onToken?.(token),
        "expired-callback": () => onToken?.(null),
        "error-callback": () => onToken?.(null),
      });
    };

    if (window.turnstile) {
      renderWidget();
    } else {
      const script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
      script.async = true;
      script.onload = renderWidget;
      document.head.appendChild(script);
    }

    return () => {
      if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current);
    };
  }, [onToken]);

  if (!SITE_KEY) return null;
  return <div ref={ref} className="flex justify-center" />;
}
