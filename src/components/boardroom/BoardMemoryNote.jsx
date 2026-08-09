import React from "react";
import { useNavigate } from "react-router-dom";
import { BookMarked } from "lucide-react";

function formatDate(value) {
  if (!value) return null;
  return new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

// Shows what past context this meeting drew on, so the board's reasoning is
// inspectable rather than something the founder has to take on trust.
export default function BoardMemoryNote({ memoryContext, companyId }) {
  const navigate = useNavigate();
  if (!memoryContext) return null;

  const decisions = memoryContext.recalled_decisions || [];
  const commitments = memoryContext.open_commitments || [];
  if (!decisions.length && !commitments.length) return null;

  return (
    <div className="bg-secondary/40 border border-border/70 rounded-2xl p-5 rise-in">
      <div className="flex items-center gap-2.5 mb-1">
        <BookMarked className="w-[18px] h-[18px] text-muted-foreground" strokeWidth={1.75} />
        <h3 className="font-display text-base">Board memory</h3>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        What the board had in front of it, beyond the question itself.
        {memoryContext.retrieval === "recency" && " Matched by recency — relevance search was unavailable."}
      </p>

      {decisions.length > 0 && (
        <div className="mb-4">
          <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-2">Referencing</div>
          <ul className="space-y-1.5">
            {decisions.map((d) => (
              <li key={d.id} className="text-sm flex gap-2">
                <span className="text-muted-foreground">—</span>
                <span>
                  your {formatDate(d.decided_at)} decision on “{d.question}”
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {commitments.length > 0 && (
        <div>
          <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-2">Open commitments in view</div>
          <ul className="space-y-1.5">
            {commitments.map((c, i) => (
              <li key={i} className="text-sm flex gap-2">
                <span className="text-muted-foreground">—</span>
                <span>
                  {c.title}
                  <span className={`text-xs ml-1.5 ${c.overdue ? "text-brand" : "text-muted-foreground"}`}>
                    ({c.days_open === 0 ? "today" : `${c.days_open}d`}{c.overdue ? ", overdue" : ""})
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {companyId && decisions.length > 0 && (
        <button
          onClick={() => navigate(`/company/${companyId}/decisions`)}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors mt-4"
        >
          View all decisions →
        </button>
      )}
    </div>
  );
}
