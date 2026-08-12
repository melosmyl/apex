import React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { PRODUCT_NAME } from "@/lib/branding";

// Shared wrapper for /privacy and /terms — plain long-form text, no prose
// plugin installed in this project, so spacing/typography is hand-styled
// here rather than per-page.
export default function LegalLayout({ title, updated, children }) {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-5 sm:px-8 py-12 lg:py-16">
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1.5 mb-10">
          <ArrowLeft className="w-4 h-4" /> Back to {PRODUCT_NAME}
        </Link>

        <h1 className="text-3xl sm:text-4xl font-display font-light mb-2">{title}</h1>
        <p className="text-sm text-muted-foreground mb-10">Last updated {updated}</p>

        <div className="space-y-8 text-[15px] leading-relaxed text-foreground/90 [&_h2]:font-display [&_h2]:text-xl [&_h2]:text-foreground [&_h2]:mb-3 [&_h2]:mt-2 [&_p]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5 [&_ul]:mb-3 [&_a]:underline [&_a]:underline-offset-2 [&_strong]:font-medium [&_strong]:text-foreground">
          {children}
        </div>
      </div>
    </div>
  );
}
