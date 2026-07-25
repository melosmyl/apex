import React, { useState, useMemo, useEffect } from "react";
import AdvisorAvatar from "@/components/AdvisorAvatar";
import FounderReplyBox from "@/components/boardroom/FounderReplyBox";
import PinnableText from "@/components/pins/PinnableText";
import { usePin } from "@/components/pins/PinContext";
import { ChevronDown, ChevronUp, MessageSquare, CornerDownRight, RefreshCw, AlertTriangle } from "lucide-react";

const MESSAGE_TYPE_META = {
  initial: { label: "Initial", className: "bg-secondary text-muted-foreground" },
  question: { label: "Question", className: "bg-secondary text-muted-foreground" },
  challenge: { label: "Challenge", className: "bg-destructive/10 text-destructive" },
  defense: { label: "Defense", className: "bg-primary/10 text-primary" },
  rebuttal: { label: "Rebuttal", className: "bg-primary/10 text-primary" },
  support: { label: "Support", className: "bg-secondary text-muted-foreground" },
  new_information: { label: "New Info", className: "bg-secondary text-muted-foreground" },
  risk_identified: { label: "Risk", className: "bg-destructive/10 text-destructive" },
  opinion_changed: { label: "Changed", className: "bg-primary text-primary-foreground" },
  final_statement: { label: "Final", className: "bg-secondary text-muted-foreground" },
  founder_message: { label: "Founder", className: "bg-primary text-primary-foreground" },
};

function FilterPill({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`text-xs rounded-full px-3.5 py-1.5 transition-all duration-300 whitespace-nowrap ${
        active ? "bg-primary text-primary-foreground" : "bg-secondary/60 text-muted-foreground hover:bg-accent/60 hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function DiscussionMessage({ msg, accent }) {
  if (msg.message_type === 'founder_message') {
    return (
      <div className="flex gap-3 group">
        <div className="shrink-0 pt-0.5">
          <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xs font-medium font-display">You</div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="font-display text-sm font-medium">You</span>
            <span className="text-xs text-muted-foreground">Founder</span>
            <span className="inline-flex items-center text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-primary text-primary-foreground">Founder Reply</span>
          </div>
          <div className="bg-primary/5 rounded-xl p-3 border border-primary/10">
            <p className="text-sm leading-relaxed text-foreground/90">{msg.message}</p>
          </div>
        </div>
      </div>
    );
  }
  const typeMeta = MESSAGE_TYPE_META[msg.message_type] || MESSAGE_TYPE_META.initial;

  return (
    <div className="flex gap-3 group">
      <div className="shrink-0 pt-0.5">
        <AdvisorAvatar name={msg.advisor_name} accent={accent} size="sm" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span className="font-display text-sm font-medium">{msg.advisor_name}</span>
          <span className="text-xs text-muted-foreground">{msg.role}</span>
          {msg.reply_to_advisor && (
            <span className="text-xs text-muted-foreground flex items-center gap-0.5 italic">
              <CornerDownRight className="w-3 h-3" /> {msg.reply_to_advisor}
            </span>
          )}
          <span className={`inline-flex items-center text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full ${typeMeta.className}`}>
            {typeMeta.label}
          </span>
          {msg.changed_opinion && (
            <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-primary text-primary-foreground">
              <RefreshCw className="w-2.5 h-2.5" /> Changed
            </span>
          )}
        </div>
        <p className="text-sm leading-relaxed text-foreground/90 mb-1">{msg.message}</p>
        {msg.new_position && (
          <p className="text-sm italic text-muted-foreground mt-1.5 pl-3 border-l-2 border-primary/30">
            New position: {msg.new_position}
          </p>
        )}
        {msg.new_risks?.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {msg.new_risks.map((r, i) => (
              <span key={i} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground bg-destructive/5 text-destructive/80 rounded-md px-2 py-0.5">
                <AlertTriangle className="w-2.5 h-2.5" /> {r}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="text-right shrink-0 pt-0.5">
        <div className="text-xs text-muted-foreground">{Math.round(msg.confidence_score || 0)}%</div>
      </div>
    </div>
  );
}

function DiscussionEvaluation({ evaluation }) {
  return (
    <div className="bg-secondary/20 p-6 border-b border-border/50">
      <div className="text-[11px] uppercase tracking-editorial text-muted-foreground mb-4 font-medium">Chair's Evaluation of the Discussion</div>
      <div className="grid sm:grid-cols-2 gap-4">
        {evaluation.strongest_arguments?.length > 0 && (
          <div>
            <div className="text-xs font-medium mb-1.5">Strongest Arguments</div>
            <ul className="space-y-1">{evaluation.strongest_arguments.map((a, i) => <li key={i} className="text-sm text-muted-foreground flex gap-2"><span>—</span>{a}</li>)}</ul>
          </div>
        )}
        {evaluation.disproven_arguments?.length > 0 && (
          <div>
            <div className="text-xs font-medium mb-1.5">Disproven or Weakened</div>
            <ul className="space-y-1">{evaluation.disproven_arguments.map((a, i) => <li key={i} className="text-sm text-muted-foreground flex gap-2"><span>—</span>{a}</li>)}</ul>
          </div>
        )}
        {evaluation.uncertain_assumptions?.length > 0 && (
          <div>
            <div className="text-xs font-medium mb-1.5">Uncertain Assumptions</div>
            <ul className="space-y-1">{evaluation.uncertain_assumptions.map((a, i) => <li key={i} className="text-sm text-muted-foreground flex gap-2"><span>—</span>{a}</li>)}</ul>
          </div>
        )}
        {evaluation.opinions_changed?.length > 0 && (
          <div>
            <div className="text-xs font-medium mb-1.5">Opinions Changed</div>
            <ul className="space-y-1">{evaluation.opinions_changed.map((a, i) => <li key={i} className="text-sm text-muted-foreground flex gap-2"><span>—</span>{a}</li>)}</ul>
          </div>
        )}
        {evaluation.missing_evidence?.length > 0 && (
          <div>
            <div className="text-xs font-medium mb-1.5">Missing Evidence</div>
            <ul className="space-y-1">{evaluation.missing_evidence.map((a, i) => <li key={i} className="text-sm text-muted-foreground flex gap-2"><span>—</span>{a}</li>)}</ul>
          </div>
        )}
      </div>
      {evaluation.most_persuasive_advisor && (
        <div className="mt-3 text-sm">
          <span className="text-muted-foreground">Most persuasive: </span>
          <span className="font-medium">{evaluation.most_persuasive_advisor}</span>
        </div>
      )}
      {evaluation.consensus_assessment && (
        <p className="text-sm text-muted-foreground mt-2">{evaluation.consensus_assessment}</p>
      )}
    </div>
  );
}

export default function ExecutiveDiscussion({ transcript = [], evaluation, advisors = [], onFollowup, meetingId, companyId, meetingTitle }) {
  const { createPin } = usePin();
  const [expanded, setExpanded] = useState(false);
  const [filterAdvisor, setFilterAdvisor] = useState("all");
  const [filterType, setFilterType] = useState("all");

  const accentOf = (name) => advisors.find((a) => a.name === name)?.accent || "#7a5c3e";

  useEffect(() => {
    if (transcript.some(m => m.message_type === 'founder_message')) setExpanded(true);
  }, [transcript]);

  const rounds = useMemo(
    () => [...new Set(transcript.map((m) => m.round))].sort((a, b) => a - b),
    [transcript]
  );

  const advisorNames = useMemo(
    () => [...new Set(transcript.map((m) => m.advisor_name))],
    [transcript]
  );

  const filtered = useMemo(() => {
    return transcript.filter((m) => {
      if (filterAdvisor !== "all" && m.advisor_name !== filterAdvisor) return false;
      if (filterType !== "all") {
        if (filterType === "challenges" && !["challenge", "rebuttal"].includes(m.message_type)) return false;
        if (filterType === "replies" && !m.reply_to_advisor) return false;
        if (filterType === "changed" && !m.changed_opinion) return false;
        if (filterType === "final" && m.message_type !== "final_statement") return false;
        if (filterType === "risks" && !(m.new_risks?.length > 0)) return false;
      }
      return true;
    });
  }, [transcript, filterAdvisor, filterType]);

  const stats = useMemo(() => {
    const challenges = transcript.filter((m) => ["challenge", "rebuttal"].includes(m.message_type)).length;
    const changed = transcript.filter((m) => m.changed_opinion).length;
    return { rounds: rounds.length, messages: transcript.length, challenges, changed };
  }, [transcript, rounds]);

  if (!transcript.length) return null;

  return (
    <div className="bg-card border border-border/50 rounded-[var(--radius)] overflow-hidden shadow-card rise-in">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-6 hover:bg-accent/30 transition-all duration-300"
      >
        <div className="flex items-center gap-3">
          <MessageSquare className="w-[18px] h-[18px] text-muted-foreground" strokeWidth={1.5} />
          <div className="text-left">
            <h3 className="font-display text-lg font-normal">Executive Discussion</h3>
            <p className="text-xs text-muted-foreground">
              {stats.rounds} rounds · {stats.messages} messages
              {stats.challenges > 0 && ` · ${stats.challenges} challenges`}
              {stats.changed > 0 && ` · ${stats.changed} opinions changed`}
            </p>
          </div>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>

      {expanded && (
        <div className="border-t border-border/50">
          {evaluation && <DiscussionEvaluation evaluation={evaluation} />}

          <div className="flex flex-wrap items-center gap-2 p-5 border-b border-border/50">
            <FilterPill active={filterAdvisor === "all"} onClick={() => setFilterAdvisor("all")}>All advisors</FilterPill>
            {advisorNames.map((name) => (
              <FilterPill key={name} active={filterAdvisor === name} onClick={() => setFilterAdvisor(name)}>{name}</FilterPill>
            ))}
            <div className="w-px h-4 bg-border mx-1" />
            <FilterPill active={filterType === "all"} onClick={() => setFilterType("all")}>All types</FilterPill>
            <FilterPill active={filterType === "challenges"} onClick={() => setFilterType("challenges")}>Challenges</FilterPill>
            <FilterPill active={filterType === "replies"} onClick={() => setFilterType("replies")}>Replies</FilterPill>
            <FilterPill active={filterType === "changed"} onClick={() => setFilterType("changed")}>Changed opinions</FilterPill>
            <FilterPill active={filterType === "final"} onClick={() => setFilterType("final")}>Final statements</FilterPill>
            <FilterPill active={filterType === "risks"} onClick={() => setFilterType("risks")}>New risks</FilterPill>
          </div>

          <div className="p-6 space-y-1 max-h-[800px] overflow-y-auto">
            {rounds.map((round) => {
              const roundMessages = filtered.filter((m) => m.round === round);
              if (!roundMessages.length) return null;
              return (
                <div key={round}>
                  <div className="flex items-center gap-3 my-6">
                    <div className="text-[11px] uppercase tracking-editorial text-muted-foreground font-medium">
                      {round === 1 ? "Round 1 — Independent Positions" : roundMessages.some(m => m.message_type === 'founder_message') ? `Round ${round} — Founder Follow-up` : `Round ${round} — Discussion`}
                    </div>
                    <div className="flex-1 h-px bg-border/40" />
                  </div>
                  <div className="space-y-6">
                    {roundMessages.map((msg, i) => (
                      <PinnableText
                        key={`${round}-${i}`}
                        companyId={companyId}
                        sourceType="executive_discussion"
                        sourceId={meetingId}
                        sourceTitle={meetingTitle || "Executive Discussion"}
                        sourceUrl={meetingId ? `/company/${companyId}/boardroom?meeting=${meetingId}` : undefined}
                        meetingId={meetingId}
                        advisorId={msg.advisor_id}
                        onPin={createPin}
                      >
                        <DiscussionMessage msg={msg} accent={accentOf(msg.advisor_name)} />
                      </PinnableText>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          {onFollowup && <FounderReplyBox onSubmit={onFollowup} />}
        </div>
      )}
    </div>
  );
}