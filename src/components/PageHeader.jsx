import React from "react";

export default function PageHeader({ eyebrow, title, description, children }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8 rise-in">
      <div>
        {eyebrow && <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-2">{eyebrow}</div>}
        <h1 className="text-3xl sm:text-4xl font-light text-balance">{title}</h1>
        {description && <p className="text-muted-foreground mt-2 max-w-xl">{description}</p>}
      </div>
      {children && <div className="shrink-0">{children}</div>}
    </div>
  );
}