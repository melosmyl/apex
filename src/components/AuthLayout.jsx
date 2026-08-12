import React from "react";
import { Link } from "react-router-dom";
import { PRODUCT_NAME, IDENTITY_ACCENT_STYLE } from "@/lib/branding";

export default function AuthLayout({ title, subtitle, footer, children }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-5 sm:px-8 py-16" style={IDENTITY_ACCENT_STYLE}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-10 sm:mb-12">
          <Link to="/" className="font-mono text-[11px] tracking-[0.25em] uppercase text-muted-foreground hover:text-foreground transition-colors">
            {PRODUCT_NAME}
          </Link>
          <h1 className="font-display text-3xl sm:text-4xl leading-tight mt-5 text-balance">{title}</h1>
          {subtitle && <p className="text-muted-foreground mt-3 text-[15px] text-balance">{subtitle}</p>}
        </div>
        <div className="bg-card rounded-2xl border border-border/70 shadow-card p-7 sm:p-8">
          {children}
        </div>
        {footer && (
          <p className="text-center text-sm text-muted-foreground mt-8">{footer}</p>
        )}
      </div>
    </div>
  );
}
