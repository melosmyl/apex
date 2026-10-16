import React from "react";
import { useNavigate } from "react-router-dom";
import { Scale } from "lucide-react";

const MAX_SHOWN = 4;
const MADE = ["accept", "modify", "reject"];

function ageLabel(date) {
  const days = Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 86400000));
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`;
  return `${Math.floor(days / 30)} months ago`;
}

// Resolutions the founder hasn't made a call on (owner, 16 October 2026):
// the board recommended something; it isn't decided until the founder
// accepts, modifies or rejects it. Quiet like the commitments card, and gone
// when there's nothing open.
export default function OpenCallsWidget({ meetings = [], records = [], companyId }) {
  const navigate = useNavigate();
  // A call made in the Decision Centre (marked decided, in the founder's words).
  const decidedThere = new Set(records.filter((r) => ["decided", "reviewed"].includes(r.status) && String(r.decision_taken || "").trim()).map((r) => r.meeting_id));
  const open = meetings
    .filter((m) => m.status === "complete" && m.board_resolution && !MADE.includes(m.founder_decision) && !decidedThere.has(m.id))
    .sort((a, b) => new Date(b.created_date || b.created_at) - new Date(a.created_date || a.created_at))
    .slice(0, MAX_SHOWN);
  if (!open.length) return null;

  return (
    <div className="bg-card border border-border/70 rounded-2xl p-6 rise-in h-full">
      <div className="flex items-center gap-2.5 mb-1">
        <Scale className="w-[18px] h-[18px] text-muted-foreground" strokeWidth={1.75} />
        <h3 className="font-display text-lg">Open calls</h3>
      </div>
      <p className="text-xs text-muted-foreground mb-4">The board recommended these. Nothing is decided until you accept, modify or reject.</p>
      <ul className="space-y-3">
        {open.map((m) => {
          const said = m.board_resolution?.verdict || m.board_resolution?.recommended_direction || "";
          return (
            <li key={m.id}>
              <button onClick={() => navigate(`/company/${companyId}/boardroom?meeting=${m.id}`)} className="w-full text-left group">
                <div className="text-sm leading-snug group-hover:text-brand transition-colors">“{m.question}”</div>
                {said && <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">Recommended: {said}</div>}
                <div className="text-xs text-muted-foreground mt-0.5">{ageLabel(m.created_date || m.created_at)} · <span className="underline underline-offset-2">Make your call</span></div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
