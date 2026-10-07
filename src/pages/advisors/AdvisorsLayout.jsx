import React, { useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PRODUCT_NAME } from "@/lib/branding";

// The public advisor pages' frame (K4): back to the site, the page, and an
// invitation to try a free meeting.
export default function AdvisorsLayout({ title, back = { to: "/", label: `Back to ${PRODUCT_NAME}` }, children }) {
  useEffect(() => {
    document.title = `${title} · ${PRODUCT_NAME}`;
  }, [title]);
  return (
    <div className="min-h-screen">
      <div className="max-w-4xl mx-auto px-5 sm:px-8 py-12 lg:py-16">
        <Link to={back.to} className="text-sm text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1.5 mb-10">
          <ArrowLeft className="w-4 h-4" /> {back.label}
        </Link>
        {children}
        <div className="mt-16 pt-8 border-t border-border/60 flex flex-wrap items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground max-w-md">Bring one real question. Your board will debate it, for free, no account needed.</p>
          <Button asChild variant="primary" className="px-6">
            <Link to="/board">Take a seat <ArrowRight className="w-4 h-4 ml-1.5" /></Link>
          </Button>
        </div>
        <footer className="flex items-center justify-center gap-4 mt-12">
          <Link to="/privacy" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Privacy</Link>
          <Link to="/terms" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Terms</Link>
        </footer>
      </div>
    </div>
  );
}
