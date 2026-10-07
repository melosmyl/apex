import React from "react";
import { Link } from "react-router-dom";
import AdvisorsLayout from "@/pages/advisors/AdvisorsLayout";
import { ADVISOR_LIBRARY } from "@/lib/advisorLibrary";
import { portraitFor } from "@/lib/portraits";
import { ADVISORS_ARE_AI, PRODUCT_NAME } from "@/lib/branding";

// Public page: the whole board, the Chair first (K4).
const ORDERED = [...ADVISOR_LIBRARY].sort((a, b) => (a.key === "chair" ? -1 : b.key === "chair" ? 1 : 0));

export default function AdvisorsIndex() {
  return (
    <AdvisorsLayout title="Meet the advisors">
      <h1 className="font-display text-4xl sm:text-5xl font-light mb-3 text-balance">Meet the advisors</h1>
      <p className="text-muted-foreground max-w-2xl mb-2">
        Twenty-one specialists and the Chair who runs every meeting. Pick the ones you want on your board at {PRODUCT_NAME}; they debate your question, and the Chair writes the resolution.
      </p>
      <p className="text-xs text-muted-foreground max-w-2xl mb-10">{ADVISORS_ARE_AI}</p>
      <ul className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
        {ORDERED.map((a) => {
          const portrait = portraitFor({ libraryKey: a.key });
          return (
            <li key={a.key} className="min-w-0">
              <Link to={`/advisors/${a.portrait_slug}`} className="group block rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand">
                {portrait ? (
                  <img src={portrait.card} alt="" loading="lazy" className="w-full aspect-[4/5] object-cover rounded-xl bg-secondary group-hover:opacity-90 transition-opacity" />
                ) : (
                  <div className="w-full aspect-[4/5] rounded-xl bg-secondary" />
                )}
                <div className="mt-2 font-medium text-sm">{a.name}</div>
                <div className="text-xs text-muted-foreground">{a.role}</div>
              </Link>
            </li>
          );
        })}
      </ul>
    </AdvisorsLayout>
  );
}
