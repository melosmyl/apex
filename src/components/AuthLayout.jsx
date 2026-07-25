import React from "react";

export default function AuthLayout({ icon: Icon, title, subtitle, footer, children }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary shadow-soft mb-5">
            <Icon className="w-6 h-6 text-primary-foreground" strokeWidth={1.5} aria-hidden="true" />
          </div>
          <h1 className="text-3xl font-display font-light tracking-tight text-foreground leading-tight">{title}</h1>
          {subtitle && <p className="text-muted-foreground mt-3 leading-relaxed">{subtitle}</p>}
        </div>
        <div className="bg-card rounded-[var(--radius)] shadow-card border border-border/50 p-8">
          {children}
        </div>
        {footer && (
          <p className="text-center text-sm text-muted-foreground mt-6">{footer}</p>
        )}
      </div>
    </div>
  );
}