import React from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight, LayoutDashboard, Users, Landmark, FolderKanban, CheckSquare } from "lucide-react";

// Scratch route for reviewing the metal button component — not linked from
// nav, deleted once approved.
//
// No simulation anywhere on this page. Hover/pressed columns use a real
// `data-force-state` attribute that the actual shipped CSS matches with
// the exact same declaration block as the real :hover/:active rules (see
// index.css) — one set of values, two selectors. There is nothing here
// that can drift from what ships, because it isn't a separate copy.

const SIDEBAR_ITEMS = [
  { label: "Dashboard", icon: LayoutDashboard, active: false },
  { label: "Executive Team", icon: Users, active: false },
  { label: "Boardroom", icon: Landmark, active: true },
  { label: "Projects", icon: FolderKanban, active: false },
  { label: "Tasks", icon: CheckSquare, active: false },
];

function StateGrid({ variant, label, dark = false }) {
  return (
    <div className={dark ? "bg-[hsl(220_8%_7%)] border border-border/70 rounded-2xl p-6" : "bg-card border border-border/70 rounded-2xl p-6"}>
      <div className="grid grid-cols-4 gap-6">
        <div>
          <div className="text-xs font-mono uppercase tracking-wide text-muted-foreground mb-3">Rest</div>
          <Button variant={variant}>{label}</Button>
        </div>
        <div>
          <div className="text-xs font-mono uppercase tracking-wide text-muted-foreground mb-3">Hover</div>
          <Button variant={variant} data-force-state="hover">{label}</Button>
        </div>
        <div>
          <div className="text-xs font-mono uppercase tracking-wide text-muted-foreground mb-3">Pressed</div>
          <Button variant={variant} data-force-state="active">{label}</Button>
        </div>
        <div>
          <div className="text-xs font-mono uppercase tracking-wide text-muted-foreground mb-3">Disabled</div>
          <Button variant={variant} disabled>{label}</Button>
        </div>
      </div>
    </div>
  );
}

export default function ButtonDemoTest() {
  return (
    <div className="min-h-screen bg-background p-8 space-y-16">
      <div>
        <h1 className="font-display text-2xl mb-1">Metal button component — review</h1>
        <p className="text-sm text-muted-foreground max-w-xl">
          Every state below is real CSS — Hover and Pressed are forced via a <code>data-force-state</code> attribute matched by the same rule as the actual :hover/:active pseudo-classes, not a simulated approximation.
        </p>
      </div>

      <div>
        <h2 className="font-display text-xl mb-4">Orange — --brand (fill) vs --brand-text (text-safe), both surfaces</h2>
        <div className="grid grid-cols-2 gap-6 max-w-2xl">
          <div className="bg-background border border-border/70 rounded-2xl p-6">
            <div className="text-xs font-mono uppercase tracking-wide text-muted-foreground mb-4">On --background</div>
            <div className="flex items-center gap-4 mb-4">
              <div className="w-16 h-16 rounded-xl bg-brand" />
              <div>
                <div className="text-sm font-medium">--brand</div>
                <div className="text-xs text-muted-foreground">fills, marks, dots — never small text</div>
              </div>
            </div>
            <p className="text-brand-text font-medium">The quick brown fox — --brand-text as body copy</p>
          </div>
          <div className="bg-card border border-border/70 rounded-2xl p-6">
            <div className="text-xs font-mono uppercase tracking-wide text-muted-foreground mb-4">On --card</div>
            <div className="flex items-center gap-4 mb-4">
              <div className="w-16 h-16 rounded-xl bg-brand" />
              <div>
                <div className="text-sm font-medium">--brand</div>
                <div className="text-xs text-muted-foreground">fills, marks, dots — never small text</div>
              </div>
            </div>
            <p className="text-brand-text font-medium">The quick brown fox — --brand-text as body copy</p>
          </div>
        </div>
      </div>

      <div>
        <h2 className="font-display text-xl mb-4">Primary — steel metal</h2>
        <StateGrid variant="primary" label="Convene the board" />
        <div className="mt-5">
          <div className="text-xs font-mono uppercase tracking-wide text-muted-foreground mb-2">Live / interactive</div>
          <Button variant="primary" size="lg">Sit in on one <ArrowRight className="w-4 h-4 ml-1.5" /></Button>
        </div>
      </div>

      <div>
        <h2 className="font-display text-xl mb-4">Secondary — outline, no metal</h2>
        <StateGrid variant="secondaryOutline" label="New question" />
        <div className="mt-5">
          <div className="text-xs font-mono uppercase tracking-wide text-muted-foreground mb-2">Live / interactive</div>
          <Button variant="secondaryOutline" size="lg">New question</Button>
        </div>
      </div>

      <div>
        <h2 className="font-display text-xl mb-4">Sidebar active state — solid fill vs. left-edge marker</h2>
        <p className="text-sm text-muted-foreground mb-4 max-w-xl">
          Mockup, not the live sidebar (no authenticated session to view it in). Same background colour, same base nav classes as CompanyLayout.jsx — only the active-item treatment differs.
        </p>
        <div className="grid grid-cols-2 gap-6 max-w-2xl">
          <div>
            <div className="text-xs font-mono uppercase tracking-wide text-muted-foreground mb-2">Current — solid fill</div>
            <div className="rounded-2xl p-3 space-y-0.5" style={{ background: "hsl(220 8% 7%)", color: "hsl(40 10% 92%)" }}>
              {SIDEBAR_ITEMS.map((item) => (
                <div
                  key={item.label}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${
                    item.active ? "bg-brand text-brand-foreground font-medium" : "opacity-70"
                  }`}
                >
                  <item.icon className="w-[18px] h-[18px]" strokeWidth={1.75} />
                  {item.label}
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="text-xs font-mono uppercase tracking-wide text-muted-foreground mb-2">Proposed — left-edge marker</div>
            <div className="rounded-2xl p-3 space-y-0.5" style={{ background: "hsl(220 8% 7%)", color: "hsl(40 10% 92%)" }}>
              {SIDEBAR_ITEMS.map((item) => (
                <div
                  key={item.label}
                  className={`relative flex items-center gap-3 pl-3 pr-3 py-2.5 rounded-lg text-sm transition-all ${
                    item.active
                      ? "opacity-100 font-medium before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:h-4 before:w-[3px] before:rounded-full before:bg-brand"
                      : "opacity-70"
                  }`}
                >
                  <item.icon className="w-[18px] h-[18px]" strokeWidth={1.75} />
                  {item.label}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div>
        <h2 className="font-display text-xl mb-4">Close-up (4x scale)</h2>
        <div className="bg-card border border-border/70 rounded-2xl p-6">
          <div style={{ height: 200 }}>
            <div style={{ transform: "scale(4)", transformOrigin: "top left" }}>
              <Button variant="primary">Begin</Button>
            </div>
          </div>
        </div>
      </div>

      <div>
        <h2 className="font-display text-xl mb-4">Enforcement guard — try to bypass shape/colour</h2>
        <p className="text-sm text-muted-foreground mb-4">This button is rendered with <code>className="rounded-full bg-brand"</code>. Open the console — it should log a warning and the classes should have no visible effect (still 6px corners, still steel).</p>
        <Button variant="primary" className="rounded-full bg-brand">Should stay square and steel</Button>
      </div>
    </div>
  );
}
