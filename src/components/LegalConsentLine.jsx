import React from "react";

// The line that tells someone what they agree to by signing up. Opens the
// documents in a new tab so a half-filled form isn't lost.
export default function LegalConsentLine({ action = "creating an account", className = "" }) {
  return (
    <p className={`text-xs text-muted-foreground text-center leading-relaxed ${className}`}>
      By {action}, you agree to our{" "}
      <a href="/terms" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">Terms of Service</a>
      {" "}and{" "}
      <a href="/privacy" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">Privacy Policy</a>.
    </p>
  );
}
