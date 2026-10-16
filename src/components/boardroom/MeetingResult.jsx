import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, Share2, ChevronDown } from "lucide-react";
import AdvisorResponseCard from "@/components/boardroom/AdvisorResponseCard";
import ExecutiveDiscussion from "@/components/boardroom/ExecutiveDiscussion";
import FounderReplyBox from "@/components/boardroom/FounderReplyBox";
import BoardMemoryNote from "@/components/boardroom/BoardMemoryNote";
import ChairOpeningNote from "@/components/boardroom/ChairOpeningNote";
import BoardUncertaintyNote from "@/components/boardroom/BoardUncertaintyNote";
import { YourCall, FounderQuestions } from "@/components/boardroom/FounderCall";
import { Section, Actions, Issues, Disagreements } from "@/components/boardroom/ResultSections";
import PinnableText from "@/components/pins/PinnableText";
import { usePin } from "@/components/pins/PinContext";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/use-toast";
import { SITE_URL } from "@/lib/branding";
import { actionsHeading, plainMissingInfo, resultSections } from "@/lib/meetingResult";
import TaskDesk from "@/components/tasks/TaskDesk";
import { useTaskRuns } from "@/lib/taskRuns";
import { formatCost } from "@/lib/money";

// A finished meeting, in the order the product principles set (M1): the
// verdict with the founder's call, the next-24-hours actions, the top
// issues, the decisions only the founder can make, where the room
// disagreed, and then, below the fold line, "Ask the board" and the full
// meeting folded away.

function ShareMeetingControl({ meetingId, initialToken, status }) {
  const [token, setToken] = useState(initialToken || null);
  const [busy, setBusy] = useState(false);

  const copy = (t) => {
    const url = `${SITE_URL}/share/meeting/${t}`;
    try { navigator.clipboard.writeText(url).catch(() => {}); } catch { /* clipboard unavailable */ }
    toast({ title: "Link copied", description: t === token && initialToken ? undefined : "Anyone with this link can view this meeting, no account needed." });
  };

  const enable = async () => {
    if (!meetingId || status !== "complete") return;
    setBusy(true);
    try {
      const newToken = crypto.randomUUID();
      await base44.entities.BoardMeeting.update(meetingId, { share_token: newToken });
      setToken(newToken);
      copy(newToken);
    } finally { setBusy(false); }
  };

  const revoke = async () => {
    setBusy(true);
    try {
      await base44.entities.BoardMeeting.update(meetingId, { share_token: null });
      setToken(null);
      toast({ title: "Sharing revoked", description: "The old link no longer works." });
    } finally { setBusy(false); }
  };

  if (status !== "complete" || !meetingId) return null;

  return token ? (
    <div className="flex items-center gap-2">
      <Button variant="secondaryOutline" size="sm" onClick={() => copy(token)}><Share2 className="w-3.5 h-3.5 mr-1.5" /> Copy public link</Button>
      <Button variant="ghost" size="sm" className="text-muted-foreground" disabled={busy} onClick={revoke}>Revoke</Button>
    </div>
  ) : (
    <Button variant="secondaryOutline" size="sm" disabled={busy} onClick={enable}><Share2 className="w-3.5 h-3.5 mr-1.5" /> Share publicly</Button>
  );
}

function List({ title, items }) {
  if (!items?.length) return null;
  return (
    <div>
      <h4 className="room-mono mb-2">{title}</h4>
      <ul className="space-y-1.5">
        {items.map((it, i) => <li key={i} className="flex gap-2 text-sm"><span className="text-muted-foreground">—</span><span className="min-w-0">{typeof it === "string" ? it : it?.detail}</span></li>)}
      </ul>
    </div>
  );
}

export default function MeetingResult({ result, advisors, companyId, onRecordDecision, onFollowup, isAnonymous }) {
  const { createPin } = usePin();
  const resolution = result.board_resolution || {};
  const sections = resultSections(resolution);
  const independent = result.independent_responses || [];
  const challenges = result.challenge_responses || [];
  const conf = Math.round(resolution.overall_confidence_score || 0);
  // A meeting just run carries meeting_id; one loaded from the database
  // (?meeting=, the archive) carries id. Either way, the same meeting.
  const meetingId = result.meeting_id || result.id;
  // The founder's saved call and answers: on a loaded row, or on the row the
  // resolution returned, then refreshed from the database when the page
  // opens, since a list of past meetings can hold an older copy of the row.
  const [saved, setSaved] = useState(() => ({ ...(result.meeting || {}), ...result }));
  // The choices appear once the fresh copy is in (or couldn't be fetched),
  // so nothing is saved on top of an older one.
  const [freshLoaded, setFreshLoaded] = useState(false);
  useEffect(() => {
    if (!meetingId) return undefined;
    let cancelled = false;
    setFreshLoaded(false);
    base44.entities.BoardMeeting.get(meetingId).then((row) => {
      if (cancelled || !row) return;
      setSaved((prev) => ({ ...prev, founder_decision: row.founder_decision, founder_decision_notes: row.founder_decision_notes, founder_answers: row.founder_answers }));
    }).catch(() => {}).finally(() => { if (!cancelled) setFreshLoaded(true); });
    return () => { cancelled = true; };
  }, [meetingId]);
  // The tasks the actions became, for "Do this for me": matched by title, or,
  // if the founder renamed it, by the one task with the same advisor and
  // type. Never by position: tasks created together share a timestamp.
  const [meetingTasks, setMeetingTasks] = useState([]);
  const loadTasks = () => {
    if (!meetingId || isAnonymous || sections.legacy) return;
    base44.entities.Task.filter({ source_meeting_id: meetingId }, "created_date", 10).then(setMeetingTasks).catch(() => {});
  };
  useEffect(loadTasks, [meetingId, isAnonymous, sections.legacy]);
  const { runs, put } = useTaskRuns(meetingTasks.map((t) => t.id), loadTasks);
  const taskFor = (a) => {
    const byTitle = meetingTasks.find((t) => t.title === a.title);
    if (byTitle) return byTitle;
    const same = a.advisor_id && a.task_type ? meetingTasks.filter((t) => t.advisor_id === a.advisor_id && t.task_type === a.task_type) : [];
    return same.length === 1 ? same[0] : null;
  };

  // Only a finished meeting takes a call.
  const decidable = (result.status || result.meeting?.status || "complete") === "complete";
  const meetingTitle = result.question || "Board Meeting";
  const sourceUrl = `/company/${companyId}/boardroom?meeting=${meetingId}`;
  const advisorsByName = Object.fromEntries((advisors || []).map((a) => [a.name, a]));
  const accentOf = (name) => advisorsByName[name]?.accent || "#7a5c3e";
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-6">
      {/* 1. The verdict, and the founder's call on it. */}
      <section className="room-card p-6 sm:p-8 rise-in">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <span className="room-mono">The verdict</span>
          <ShareMeetingControl meetingId={meetingId} initialToken={result.share_token} status={result.status || "complete"} />
        </div>
        <PinnableText companyId={companyId} sourceType="board_resolution" sourceId={meetingId} sourceTitle={meetingTitle} sourceUrl={sourceUrl} meetingId={meetingId} onPin={createPin}>
          <p className="font-display text-[1.6rem] font-light leading-tight tracking-[-0.01em] text-balance sm:text-[2rem]">{sections.verdict}</p>
        </PinnableText>
        {decidable && (
          <div className="mt-5 min-h-[3.25rem] border-t border-border pt-4">
            {freshLoaded && <YourCall key={meetingId} meetingId={meetingId} initialCall={saved.founder_decision} initialNotes={saved.founder_decision_notes} />}
          </div>
        )}
      </section>

      {/* 2. The next 24 hours. */}
      {sections.actions.length > 0 && (
        <Section label={sections.legacy ? "Before spending more time on this" : "Next 24 hours"} title={sections.legacy ? null : actionsHeading(sections.actions.length)}>
          {sections.legacy && resolution.priority_frame && <p className="mb-4 mt-1 text-sm text-muted-foreground">{resolution.priority_frame}</p>}
          <div className={sections.legacy ? "mt-3" : ""}>
            <Actions
              actions={sections.actions}
              advisorsByName={advisorsByName}
              renderAfter={(a) => {
                const task = taskFor(a);
                return task ? <TaskDesk task={task} run={runs[task.id]} onChanged={(run) => { if (run) put(run); loadTasks(); }} /> : null;
              }}
            />
          </div>
          {!isAnonymous && companyId && (
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
              <p className="text-sm text-muted-foreground">These are on your Tasks list.</p>
              <Link to={`/company/${companyId}/tasks?meeting=${meetingId}`}>
                <Button variant="secondaryOutline" size="sm">Open Tasks <ArrowRight className="w-3.5 h-3.5 ml-1.5" /></Button>
              </Link>
            </div>
          )}
        </Section>
      )}

      {/* 3. The top issues. */}
      {sections.issues.length > 0 && (
        <Section label={sections.legacy ? "Main risks" : "Top issues"} title={sections.legacy ? "The main risks the room raised" : "What could sink your current plan"}>
          <Issues issues={sections.issues} />
        </Section>
      )}

      {/* 4. Decisions only the founder can make. */}
      {sections.questions.length > 0 && (
        <Section label="Your decisions" title="Decisions only you can make">
          <FounderQuestions key={`${meetingId}:${freshLoaded}`} meetingId={meetingId} questions={sections.questions} initialAnswers={saved.founder_answers} readOnly={!decidable || !freshLoaded} />
        </Section>
      )}

      {/* 5. Where the room disagreed. */}
      {sections.disagreements.length > 0 && (
        <Section label="Disagreement" title="Where the room disagreed">
          <Disagreements items={sections.disagreements} />
        </Section>
      )}

      {/* The fold line: the follow-up first, then the full meeting. */}
      <div className="flex items-center gap-3 pt-2" aria-hidden="true">
        <span className="h-px flex-1 bg-foreground/30" />
        <span className="room-mono">The full meeting</span>
        <span className="h-px flex-1 bg-foreground/30" />
      </div>
      {result?.cost_usd != null && (
        <p className="-mt-3 text-center text-xs text-muted-foreground">This meeting cost {formatCost(result.cost_usd)}, every advisor and the Chair included.</p>
      )}

      {onFollowup && (
        <section className="room-card p-5 sm:p-6">
          <span className="room-mono">Ask the board</span>
          <p className="mt-1 mb-4 text-sm text-muted-foreground">Share more context, challenge a recommendation, or ask a follow-up. Every advisor who was in this meeting will respond.</p>
          <FounderReplyBox onSubmit={onFollowup} />
        </section>
      )}

      <div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex w-full items-center justify-between gap-3 rounded-md border-[1.5px] border-foreground bg-card px-5 py-3.5 text-left hover:bg-secondary"
        >
          <span>
            <span className="font-display text-lg">{open ? "Hide the full meeting" : "Open the full meeting"}</span>
            <span className="mt-0.5 block text-sm text-muted-foreground">The Chair's reasoning, what the board agreed, assumptions, confidence, each advisor's view and the minutes.</span>
          </span>
          <ChevronDown className={`h-5 w-5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>

        {open && (
          <div className="mt-6 space-y-6">
            <ChairOpeningNote chairOpening={result.chair_opening} />

            <section className="room-card p-5 sm:p-6 space-y-5">
              <div className="flex items-start justify-between gap-4">
                <span className="room-mono">The Chair's reasoning</span>
                <div className="text-right shrink-0">
                  <div className="font-display text-2xl tabular-nums">{conf}<span className="text-base text-muted-foreground">%</span></div>
                  <div className="room-mono">Confidence</div>
                </div>
              </div>
              {resolution.confidence_reason && <p className="text-sm text-muted-foreground">{resolution.confidence_reason}</p>}
              <PinnableText companyId={companyId} sourceType="board_resolution" sourceId={meetingId} sourceTitle={meetingTitle} sourceUrl={sourceUrl} meetingId={meetingId} onPin={createPin}>
                {resolution.recommended_direction && !sections.legacy && <p className="font-display text-lg leading-snug">{resolution.recommended_direction}</p>}
                {resolution.executive_summary && <p className="mt-3 text-[15px] leading-relaxed">{resolution.executive_summary}</p>}
                {resolution.reasoning && <p className="mt-3 text-sm leading-relaxed">{resolution.reasoning}</p>}
              </PinnableText>
              <div className="grid gap-5 sm:grid-cols-2">
                <List title="What the board agreed" items={resolution.areas_of_agreement} />
                <List title="What this rests on" items={resolution.assumptions} />
              </div>
              <List title="What would change the board's mind" items={resolution.what_would_change_minds} />
              {(typeof resolution.minority_opinion === "string" ? resolution.minority_opinion : "") && (
                <div>
                  <h4 className="room-mono mb-2">The minority view</h4>
                  <p className="text-sm">{resolution.minority_opinion}</p>
                </div>
              )}
              <List title="Missing information" items={(resolution.missing_information || []).map((it) => plainMissingInfo(typeof it === "string" ? it : it?.detail)).filter(Boolean)} />
              {resolution.recommended_experiment && (
                <div>
                  <h4 className="room-mono mb-2">An experiment worth running</h4>
                  <p className="text-sm">{resolution.recommended_experiment}</p>
                </div>
              )}
              {onRecordDecision && (
                <div className="flex justify-end">
                  <Button onClick={onRecordDecision} variant="secondaryOutline" className="px-5">Record in Decision Centre <ArrowRight className="w-4 h-4 ml-1.5" /></Button>
                </div>
              )}
            </section>

            <BoardMemoryNote memoryContext={result.memory_context} companyId={companyId} />
            <BoardUncertaintyNote resolution={resolution} />

            <ExecutiveDiscussion transcript={result.discussion_transcript || []} evaluation={resolution.discussion_evaluation} advisors={advisors} meetingId={meetingId} companyId={companyId} meetingTitle={meetingTitle} />

            {independent.length > 0 && (
              <div>
                <h4 className="font-display text-lg mb-3">Each advisor's view</h4>
                <div className="grid sm:grid-cols-2 gap-4">
                  {independent.map((resp, i) => {
                    const challenge = challenges.find(c => c.advisor_id === resp.advisor_id);
                    return <AdvisorResponseCard key={i} independent={resp} challenge={challenge} accent={accentOf(resp.advisor_name)} meetingId={meetingId} companyId={companyId} meetingTitle={meetingTitle} />;
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
