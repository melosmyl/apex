import React from "react";
import { Link } from "react-router-dom";
import { Check, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

const TIERS = [
  {
    name: "Free",
    dot: "bg-emerald-400",
    price: "£0",
    period: "forever",
    tagline: "Perfect for falling in love with the product.",
    features: ["1 company", "2 executive advisors", "10 board meetings per month", "Decision history", "Basic company memory"],
    cta: "Get started",
    href: "/register",
    highlight: false,
  },
  {
    name: "Pro",
    dot: "bg-blue-500",
    price: "£29",
    period: "per month",
    tagline: "Where 80% of customers end up.",
    features: ["Unlimited advisors", "Unlimited board meetings", "Unlimited decisions", "Full company memory", "Projects", "Documents", "Knowledge Base", "Research", "Priority AI speed"],
    cta: "Start with Pro",
    href: "/register",
    highlight: true,
  },
  {
    name: "Team",
    dot: "bg-violet-500",
    price: "£79",
    period: "per month",
    tagline: "For startups with employees.",
    features: ["Multiple users", "Shared executive board", "Team permissions", "Shared company knowledge", "Meeting history", "Collaboration"],
    cta: "Start with Team",
    href: "/register",
    highlight: false,
  },
  {
    name: "Enterprise",
    dot: "bg-stone-700",
    price: "Custom",
    period: "",
    tagline: "For larger organisations.",
    features: ["Private models", "Security & compliance", "Custom advisors", "Integrations", "Dedicated support"],
    cta: "Contact sales",
    href: "mailto:?subject=Advisory — Enterprise Plan",
    highlight: false,
  },
];

export default function Pricing() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-5 sm:px-8 py-12 lg:py-20">
        <div className="text-center mb-14 fade-in">
          <div className="text-xs uppercase tracking-[0.25em] text-muted-foreground mb-3">Pricing</div>
          <h1 className="text-4xl sm:text-5xl font-light">Plans that scale with you</h1>
          <p className="text-muted-foreground mt-4 font-display italic text-lg max-w-xl mx-auto">
            The limitation isn't the quality. It's the scale.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {TIERS.map((t) => (
            <div key={t.name} className={`relative flex flex-col bg-card border rounded-2xl p-6 rise-in ${t.highlight ? "border-foreground/20 ring-1 ring-foreground/10 shadow-lg" : "border-border/70"}`}>
              {t.highlight && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="text-[10px] uppercase tracking-wider bg-foreground text-background px-3 py-1 rounded-full">Most popular</span>
                </div>
              )}
              <div className="flex items-center gap-2 mb-4 mt-1">
                <span className={`w-2.5 h-2.5 rounded-full ${t.dot}`} />
                <span className="text-sm font-medium">{t.name}</span>
              </div>
              <div className="flex items-baseline gap-1.5 mb-1">
                <span className="text-4xl font-display font-light">{t.price}</span>
                {t.period && <span className="text-sm text-muted-foreground">{t.period}</span>}
              </div>
              <p className="text-sm text-muted-foreground mb-5 min-h-[40px]">{t.tagline}</p>
              <div className="border-t border-border/60 mb-4" />
              <ul className="space-y-2.5 mb-7 flex-1">
                {t.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <Check className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" strokeWidth={2} />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <a href={t.href} className="block">
                <Button variant={t.highlight ? "default" : "outline"} className="w-full rounded-full">{t.cta}</Button>
              </a>
            </div>
          ))}
        </div>

        <div className="text-center mt-12">
          <Link to="/" className="text-sm text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1.5">
            <ArrowLeft className="w-4 h-4" /> Back to app
          </Link>
        </div>
      </div>
    </div>
  );
}