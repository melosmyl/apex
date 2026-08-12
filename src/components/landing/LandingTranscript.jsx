import React, { useEffect, useState } from "react";

const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/getSharedMeeting`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Name-card label — no faces, per the landing page's hard rule against
// portraying fake advisors visually. Just who's speaking and their role.
function NameCard({ name, role, changed }) {
  return (
    <div className="flex items-baseline gap-2 mb-2 flex-wrap">
      <span className="font-landing text-base sm:text-lg italic">{name}</span>
      <span className="font-mono text-[10px] tracking-[0.15em] uppercase text-muted-foreground">{role}</span>
      {changed && (
        <span className="font-mono text-[9px] tracking-[0.15em] uppercase text-muted-foreground border border-border/70 rounded-full px-2 py-0.5">
          changed position
        </span>
      )}
    </div>
  );
}

function TranscriptMessage({ msg }) {
  return (
    <div className="py-5 border-b border-border/50 last:border-b-0">
      <NameCard name={msg.advisor_name} role={msg.role} changed={msg.changed_opinion} />
      {msg.reply_to_advisor && (
        <p className="font-mono text-[10px] tracking-[0.1em] uppercase text-muted-foreground mb-1.5">
          → responding to {msg.reply_to_advisor}
        </p>
      )}
      <p className="text-[15px] sm:text-base leading-relaxed text-foreground/90">{msg.message}</p>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="border border-border/70 rounded-2xl px-6 py-16 text-center bg-card/40">
      <p className="font-landing text-xl italic text-muted-foreground mb-2">The board is in session.</p>
      <p className="text-sm text-muted-foreground max-w-sm mx-auto">A real, unedited transcript goes here — nothing on this page is illustrative.</p>
    </div>
  );
}

export default function LandingTranscript({ token }) {
  const [state, setState] = useState(token ? "loading" : "empty"); // loading | ok | unavailable | empty
  const [meeting, setMeeting] = useState(null);

  useEffect(() => {
    if (!token) { setState("empty"); return; }
    let cancelled = false;
    setState("loading");
    fetch(`${FUNCTION_URL}?token=${encodeURIComponent(token)}`, { headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` } })
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => { if (!cancelled) { setMeeting(data); setState("ok"); } })
      .catch(() => { if (!cancelled) setState("unavailable"); });
    return () => { cancelled = true; };
  }, [token]);

  if (state === "empty" || state === "unavailable") return <EmptyState />;
  if (state === "loading") return <div className="min-h-[240px]" />;

  const rounds = [...new Set((meeting.discussion_transcript || []).map((m) => m.round))].sort((a, b) => a - b);
  const conf = Math.round(meeting.overall_confidence_score || meeting.confidence_score || 0);

  return (
    <div>
      <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-muted-foreground mb-3">A real board meeting, unedited</p>
      <h3 className="font-landing text-2xl sm:text-3xl leading-snug mb-8 text-balance">"{meeting.question}"</h3>

      <div className="space-y-0">
        {rounds.map((round) => (
          <div key={round}>
            <div className="flex items-center gap-3 my-2">
              <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-muted-foreground/70">
                {round === 1 ? "Round 1 — independent positions" : `Round ${round} — discussion`}
              </div>
              <div className="flex-1 h-px bg-border/40" />
            </div>
            {meeting.discussion_transcript.filter((m) => m.round === round).map((m, i) => (
              <TranscriptMessage key={i} msg={m} />
            ))}
          </div>
        ))}
      </div>

      {meeting.recommended_direction && (
        <div className="mt-8 pt-8 border-t border-border/60">
          <div className="flex items-baseline justify-between gap-4 mb-3">
            <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-muted-foreground">The chair's resolution</span>
            <span className="font-landing text-lg">{conf}<span className="text-xs text-muted-foreground not-italic font-mono align-super">%</span></span>
          </div>
          <p className="font-landing text-xl sm:text-2xl italic leading-snug text-balance">{meeting.recommended_direction}</p>
        </div>
      )}
    </div>
  );
}
