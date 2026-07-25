import React from "react";

export default function PageHeader({ eyebrow, title, description, children }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6 mb-12 rise-in">
      <div className="max-w-2xl">
        {eyebrow && <div className="text-[11px] uppercase tracking-editorial text-muted-foreground mb-3 font-medium">{eyebrow}</div>}
        <h1 className="text-3xl sm:text-4xl font-display font-light text-balance leading-tight">{title}</h1>
        {description && <p className="text-muted-foreground mt-3 leading-relaxed">{description}</p>}
      </div>
      {children && <div className="shrink-0">{children}</div>}
    </div>
  );
}