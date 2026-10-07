import React from "react";

// The page header from the Workstream L mocks: a mono eyebrow in olive, a
// light Fraunces title (an italic burgundy word can be passed as part of
// `title`, e.g. <>The <em>Room.</em></>), and a muted description.
export default function PageHeader({ eyebrow, title, description, children }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-5 mb-8 rise-in">
      <div className="min-w-0">
        {eyebrow && <div className="room-mono mb-2">{eyebrow}</div>}
        <h1 className="text-[2.2rem] sm:text-[3.4rem] leading-none font-light tracking-[-0.03em] text-balance [&_em]:italic [&_em]:text-brand">{title}</h1>
        {description && <p className="text-muted-foreground mt-3 max-w-xl leading-relaxed">{description}</p>}
      </div>
      {children && <div className="shrink-0">{children}</div>}
    </div>
  );
}
