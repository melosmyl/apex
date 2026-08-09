import React from "react";
import { Flame, TrendingUp } from "lucide-react";
import { momentumLabel } from "@/lib/momentum";

const TONE_STYLES = {
  high: { bg: "bg-brand/10", text: "text-brand", ring: "ring-brand/20" },
  medium: { bg: "bg-amber-100/60", text: "text-amber-700", ring: "ring-amber-200" },
  low: { bg: "bg-blue-50", text: "text-blue-600", ring: "ring-blue-100" },
  idle: { bg: "bg-secondary", text: "text-muted-foreground", ring: "ring-border" },
};

// Absence is never a penalty: past a short grace period we stop implying
// "you should have been here" and switch to welcoming the founder back,
// still showing the streak they already earned rather than a reset "0".
const AWAY_AFTER_DAYS = 2;

export default function MomentumWidget({ streak, recentCount }) {
  const { current = 0, best = 0, daysSinceLastActivity } = streak || {};
  const isAway = daysSinceLastActivity !== null && daysSinceLastActivity >= AWAY_AFTER_DAYS;
  const momentum = momentumLabel(isAway ? 0 : current, recentCount);
  const tone = isAway ? TONE_STYLES.idle : (TONE_STYLES[momentum.tone] || TONE_STYLES.idle);

  // Mini sparkline bars for the last 7 days (simulated from recentCount)
  const bars = Array.from({ length: 7 }, (_, i) => {
    const h = recentCount > 0 ? Math.max(20, Math.min(100, 30 + (recentCount / (i + 1)) * 15)) : 15;
    return h;
  });

  return (
    <div className="bg-card border border-border/70 rounded-2xl p-6 rise-in h-full">
      <div className="flex items-center gap-2.5 mb-4">
        <Flame className="w-[18px] h-[18px] text-muted-foreground" strokeWidth={1.75} />
        <h3 className="font-display text-lg">Momentum</h3>
      </div>

      {isAway ? (
        <div className="mb-4">
          <div className="font-display text-lg mb-1">Welcome back</div>
          <p className="text-sm text-muted-foreground">
            Your last streak was <span className="font-medium text-foreground">{current} {current === 1 ? "day" : "days"}</span>
            {best > current && <span> — your best is {best}</span>}. Pick up whenever you're ready.
          </p>
        </div>
      ) : (
        <div className="flex items-end gap-4 mb-4">
          <div>
            <div className="font-display text-3xl">{current}</div>
            <div className="text-xs text-muted-foreground">day streak{best > current && ` · best ${best}`}</div>
          </div>
          <div className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${tone.bg} ${tone.text} ring-1 ${tone.ring}`}>
            {momentum.label}
          </div>
        </div>
      )}

      <div className="flex items-end gap-1.5 h-10 mb-2">
        {bars.map((h, i) => (
          <div
            key={i}
            className={`flex-1 rounded-sm transition-all ${i === bars.length - 1 ? tone.bg : "bg-secondary"}`}
            style={{ height: `${h}%` }}
          />
        ))}
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <TrendingUp className="w-3 h-3" />
          {recentCount} actions this week
        </span>
        <span>Last 7 days</span>
      </div>
    </div>
  );
}