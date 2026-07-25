import React from "react";

export default function PageHeader({ eyebrow, title, description, children }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-5 mb-10 rise-in">
      <div>
        {eyebrow && <div className="text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground/80 mb-3 font-medium">{eyebrow}</div>}
        <h1 className="text-3xl sm:text-[2.5rem] sm:leading-[1.15] font-light text-balance">{title}</h1>
        {description && <p className="text-muted-foreground mt-3 max-w-xl leading-relaxed">{description}</p>}
      </div>
      {children && <div className="shrink-0">{children}</div>}
    </div>
  );
}