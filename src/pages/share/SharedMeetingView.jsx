import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Gavel, AlertTriangle, Lightbulb, ChevronDown, ChevronUp, CornerDownRight, RefreshCw } from "lucide-react";
import AdvisorAvatar from "@/components/AdvisorAvatar";

const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/getSharedMeeting`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

function List({ icon: Icon, title, items }) {
  if (!items?.length) return null;
  return (
    <div className="bg-card border border-border/70 rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-3"><Icon className="w-4 h-4 text-muted-foreground" /><h4 className="font-display text-base">{title}</h4></div>
      <ul className="space-y-2">
        {items.map((it, i) => <li key={i} className="text-sm flex gap-2"><span className="text-muted-foreground">—</span>{it}</li>)}
      </ul>
    </div>
  );
}

function AdvisorCard({ resp, challenge }) {
  return (
    <div className="bg-card border border-border/70 rounded-2xl p-5">
      <div className="flex items-start gap-3 mb-4">
        <AdvisorAvatar name={resp.advisor_name} size="md" />
        <div className="flex-1 min-w-0">
          <h4 className="font-display text-lg leading-tight">{resp.advisor_name}</h4>
          <p className="text-xs text-muted-foreground">{resp.role}</p>
        </div>
        <div className="font-display text-xl shrink-0">{Math.round(resp.confidence_score || 0)}<span className="text-sm text-muted-foreground">%</span></div>
      </div>
      {resp.unavailable ? (
        <p className="text-sm text-muted-foreground italic">This advisor could not be reached — the board continued without them.</p>
      ) : (
        <div className="space-y-3">
          <div><div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-0.5">Position</div><p className="text-sm">{resp.position}</p></div>
          <div><div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-0.5">Recommendation</div><p className="text-sm font-medium">{resp.recommendation}</p></div>
          {resp.risks?.length > 0 && (
            <div><div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Risks Identified</div>
              <ul className="space-y-1">{resp.risks.map((r, i) => <li key={i} className="text-sm flex gap-2"><span className="text-muted-foreground">—</span>{r}</li>)}</ul>
            </div>
          )}
        </div>
      )}
      {challenge && (
        <div className="mt-4 pt-4 border-t border-border/50">
          <div className="text-[10px] uppercase tracking-widest text-destructive/80 mb-1.5">Challenge Round</div>
          {challenge.challenged_advisor && <p className="text-xs text-muted-foreground mb-1">Challenged {challenge.challenged_advisor}: {challenge.point_challenged}</p>}
          <p className="text-sm italic">{challenge.revised_position}</p>
        </div>
      )}
    </div>
  );
}

function TranscriptEntry({ msg }) {
  return (
    <div className="flex gap-3">
      <div className="shrink-0 pt-0.5"><AdvisorAvatar name={msg.advisor_name} size="sm" /></div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span className="font-display text-sm font-medium">{msg.advisor_name}</span>
          <span className="text-xs text-muted-foreground">{msg.role}</span>
          {msg.reply_to_advisor && (
            <span className="text-xs text-muted-foreground flex items-center gap-0.5 italic"><CornerDownRight className="w-3 h-3" /> {msg.reply_to_advisor}</span>
          )}
          {msg.changed_opinion && (
            <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-primary text-primary-foreground"><RefreshCw className="w-2.5 h-2.5" /> Changed position</span>
          )}
        </div>
        <p className="text-sm leading-relaxed text-foreground/90">{msg.message}</p>
        {msg.new_position && <p className="text-sm italic text-muted-foreground mt-1.5 pl-3 border-l-2 border-primary/30">New position: {msg.new_position}</p>}
      </div>
      <div className="text-right shrink-0 pt-0.5 text-xs text-muted-foreground">{Math.round(msg.confidence_score || 0)}%</div>
    </div>
  );
}

function NotAvailable() {
  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <p className="text-muted-foreground text-lg">This link is no longer available.</p>
    </div>
  );
}

export default function SharedMeetingView() {
  const { token } = useParams();
  const [state, setState] = useState("loading"); // loading | ok | unavailable
  const [meeting, setMeeting] = useState(null);
  const [transcriptOpen, setTranscriptOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`${FUNCTION_URL}?token=${encodeURIComponent(token)}`, { headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` } })
      .then((res) => res.ok ? res.json() : Promise.reject())
      .then((data) => { if (!cancelled) { setMeeting(data); setState("ok"); } })
      .catch(() => { if (!cancelled) setState("unavailable"); });
    return () => { cancelled = true; };
  }, [token]);

  if (state === "loading") return <div className="min-h-screen" />;
  if (state === "unavailable") return <NotAvailable />;

  const rounds = [...new Set((meeting.discussion_transcript || []).map((m) => m.round))].sort((a, b) => a - b);
  const conf = Math.round(meeting.overall_confidence_score || 0);

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-5 sm:px-8 py-12 space-y-8">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">{meeting.company_name ? `${meeting.company_name}'s board` : "A board meeting"}</p>
          <h1 className="font-display text-2xl sm:text-3xl leading-snug">"{meeting.question}"</h1>
          {meeting.participants?.length > 0 && <p className="text-sm text-muted-foreground mt-2">{meeting.participants.join(", ")}</p>}
        </div>

        {meeting.chair_opening && (
          <div className="bg-secondary/40 rounded-2xl p-5 flex gap-3">
            <Gavel className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
            <p className="text-sm text-muted-foreground leading-relaxed">{meeting.chair_opening}</p>
          </div>
        )}

        <div className="bg-card border border-border/70 rounded-2xl p-6 sm:p-8">
          <div className="flex items-start justify-between gap-4 mb-5">
            <div className="flex items-center gap-2"><Gavel className="w-5 h-5 text-primary" /><h3 className="font-display text-2xl">Board Resolution</h3></div>
            <div className="text-center shrink-0">
              <div className="font-display text-3xl">{conf}<span className="text-lg text-muted-foreground">%</span></div>
              <div className="text-[11px] uppercase tracking-widest text-muted-foreground">Confidence</div>
            </div>
          </div>
          <p className="text-[15px] leading-relaxed mb-6">{meeting.executive_summary}</p>
          <div className="bg-accent/50 rounded-xl p-5 mb-6">
            <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1.5">Recommended Direction</div>
            <p className="font-display text-lg leading-snug">{meeting.recommended_direction}</p>
          </div>
          {meeting.reasoning && (
            <div className="mb-4"><div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1">Reasoning</div><p className="text-sm leading-relaxed">{meeting.reasoning}</p></div>
          )}
          <div className="grid sm:grid-cols-2 gap-4 mb-4">
            <List icon={Lightbulb} title="Areas of Agreement" items={meeting.areas_of_agreement} />
            <List icon={AlertTriangle} title="Areas of Disagreement" items={meeting.areas_of_disagreement} />
          </div>
          {meeting.minority_opinion && (
            <div className="bg-destructive/5 border border-destructive/10 rounded-xl p-5">
              <div className="text-[11px] uppercase tracking-widest text-destructive/80 mb-1.5">Minority Opinion — preserved, not overruled</div>
              <p className="text-sm leading-relaxed">{meeting.minority_opinion}</p>
            </div>
          )}
        </div>

        <div>
          <h4 className="font-display text-lg mb-3">Where the board actually stood</h4>
          <div className="grid sm:grid-cols-2 gap-4">
            {(meeting.independent_responses || []).map((resp, i) => {
              const challenge = (meeting.challenge_responses || []).find((c) => c.advisor_name === resp.advisor_name || c.challenged_advisor === resp.advisor_name);
              return <AdvisorCard key={i} resp={resp} challenge={challenge} />;
            })}
          </div>
        </div>

        {rounds.length > 0 && (
          <div className="bg-card border border-border/70 rounded-2xl overflow-hidden">
            <button onClick={() => setTranscriptOpen((v) => !v)} className="w-full flex items-center justify-between p-5 hover:bg-accent/30 transition-colors">
              <h3 className="font-display text-lg">Full board debate</h3>
              {transcriptOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
            </button>
            {transcriptOpen && (
              <div className="border-t border-border/50 p-4 space-y-6">
                {rounds.map((round) => (
                  <div key={round}>
                    <div className="flex items-center gap-3 my-3">
                      <div className="text-[11px] uppercase tracking-widest text-muted-foreground">{round === 1 ? "Round 1 — Independent Positions" : `Round ${round} — Discussion`}</div>
                      <div className="flex-1 h-px bg-border/50" />
                    </div>
                    <div className="space-y-5">
                      {meeting.discussion_transcript.filter((m) => m.round === round).map((m, i) => <TranscriptEntry key={i} msg={m} />)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <p className="text-center text-xs text-muted-foreground pt-4">A real board meeting, unedited. Advisors were free to disagree — and did.</p>
      </div>
    </div>
  );
}
