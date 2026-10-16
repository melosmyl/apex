import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { base44, supabase } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Landmark } from "lucide-react";
import EmptyState from "@/components/EmptyState";
import BoardroomBanner from "@/components/boardroom/BoardroomBanner";
import AdvisorSelectionRow from "@/components/boardroom/AdvisorSelectionRow";
import MeetingResult from "@/components/boardroom/MeetingResult";
import HumanPerspectiveStep from "@/components/boardroom/HumanPerspectiveStep";
import LiveMeeting from "@/components/boardroom/live/LiveMeeting";
import OpenDoor from "@/components/boardroom/live/OpenDoor";
import PaceChoice, { BeforeNote, turnShapeAsked, usePaceOffered } from "@/components/boardroom/PaceChoice";
import { usePin } from "@/components/pins/PinContext";
import { startMeeting, continueMeeting, retryMeeting, meetingPhase, isRunningOnServer, runFounderFollowup, embedDecisionInBackground, assignChairs, beforeMeetingNote, MAX_DEBATERS, MIN_DEBATERS, suggestedQuestionsFor } from "@/lib/boardroom";
import { findChair, chairOrBuiltIn } from "@/lib/chair";
import { useAdvisorProfile } from "@/components/advisors/AdvisorProfilePanel";
import { useAssistant } from "@/lib/AssistantContext";

const POLL_INTERVAL_MS = 2000;
// Phases in which the server is running the meeting and the page follows it.
const LIVE_PHASES = ["preparing", "human_input", "discussion", "resolution"];

// A Round 1 position with its reason, as the server writes it.
function positionWithReason(r) {
  // Only an answer given with the turn shape on has a reason: any other
  // shows exactly as before.
  const reason = (r.because || "").trim();
  const head = r.position || r.recommendation || "";
  return reason ? `${head.trim()}\nWhy: ${reason}` : head;
}

function toRoundOneMessages(responses = []) {
  return responses.map((r) => ({
    round: 1,
    advisor_id: r.advisor_id,
    advisor_name: r.advisor_name,
    role: r.role,
    message: positionWithReason(r),
    message_type: "initial",
    reply_to_advisor: null,
    changed_opinion: false,
    new_position: null,
    new_risks: r.risks || [],
    confidence_score: r.confidence_score || 0,
    unavailable: r.unavailable || false,
    redone_after: r.redone_after || null,
  }));
}



export default function BoardDebate({ company, companyId, advisors, initialQuestion, initialPace, initialBefore, initialSelectedIds, onSelectionChange, loadedMeeting, autoStart, onResult, onResultShown, routeFromNoteId, freeAttemptId }) {
  const navigate = useNavigate();
  const [selectedIds, setSelectedIds] = useState(null);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [question, setQuestion] = useState(initialQuestion || "");
  // A meeting reopened while the server is still running it (the founder
  // locked their phone, or closed the tab) is followed live again.
  const resuming = isRunningOnServer(loadedMeeting);
  // A server-run meeting that stopped: reopened, it offers to try again
  // rather than showing a resolution it doesn't have.
  const stopped = loadedMeeting?.driver === "server" && loadedMeeting.status === "failed";
  // True only until the founder starts a new question.
  const resumingRef = useRef(resuming);
  const [phase, setPhase] = useState(resuming ? meetingPhase(loadedMeeting) : stopped ? "idle" : loadedMeeting ? "result" : "idle");
  const [result, setResult] = useState(resuming || stopped ? null : loadedMeeting || null);
  const [error, setError] = useState(stopped ? loadedMeeting.failure_reason || "The board couldn't finish this meeting." : null);
  // A server-run meeting that stopped, which the founder can try again.
  const [failedMeetingId, setFailedMeetingId] = useState(stopped ? loadedMeeting.id : null);
  // The meeting the page is following. Chosen here before startMeeting
  // runs, so the live view can follow exactly this meeting while it forms.
  const [pendingMeetingId, setPendingMeetingId] = useState(resuming ? loadedMeeting.id : null);
  const [liveTranscript, setLiveTranscript] = useState([]);
  // When this meeting was convened, for the "Meeting in session" line.
  const [startedAt, setStartedAt] = useState(resuming ? new Date(loadedMeeting.created_at) : null);
  // A finished meeting's result shows once the live playback has caught up
  // (or the founder skips ahead); a loaded past meeting shows straight away.
  const [showResult, setShowResult] = useState(!!loadedMeeting && !resuming);
  const resultSentRef = useRef(false);
  // Kept in a ref so a parent that passes a new function each render doesn't
  // restart the meeting's polling.
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;
  // Set once the founder has sent (or skipped) the human advisors' views: a
  // poll that left before then mustn't bring that step back.
  const humansSentRef = useRef(false);
  const finishPlayback = useCallback(() => { setShowResult(true); onResultShown?.(); }, [onResultShown]);
  // How many rounds a discussion can run, as the engine reads it.
  const [maxRounds, setMaxRounds] = useState(3);
  const paceOffered = usePaceOffered();
  const [pace, setPace] = useState(initialPace || "quick");
  const [beforeNote, setBeforeNote] = useState(initialBefore || "");
  // The meeting row as last seen, for the open door: notes, extra rounds,
  // whether the board is waiting for the founder.
  const [liveRow, setLiveRow] = useState(resuming ? loadedMeeting : null);
  // How far the founder's screen has played, and the pinned box's height,
  // so the meeting can scroll above it (P1.1).
  useEffect(() => {
    base44.entities.SystemLimits.list().then((rows) => {
      const n = rows?.[0]?.max_discussion_rounds;
      if (Number.isInteger(n) && n > 0) setMaxRounds(n);
    }).catch(() => {});
  }, []);
  // The transcript only ever grows: a slow poll answering after a newer one
  // mustn't take rounds away.
  const growTranscript = useCallback((next) => {
    if (next?.length) setLiveTranscript((prev) => (next.length >= prev.length ? next : prev));
  }, []);
  const { createPin } = usePin();
  const [chairOpening, setChairOpening] = useState(loadedMeeting?.chair_opening || null);
  const [isAnonymous, setIsAnonymous] = useState(false);
  // Fixed once a meeting starts — an advisor keeps the same chair for the
  // whole discussion rather than jumping seats between turns.
  const [seatAssignment, setSeatAssignment] = useState({});

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setIsAnonymous(!!data?.user?.is_anonymous));
  }, []);

  // Suppresses the Assistant widget entirely while a meeting is running —
  // the boardroom is the product's centre of gravity, nothing may split
  // attention while one is active. Mirrors this component's own state
  // outward rather than changing its state machine.
  const { setMeetingRunning, checkNoteRelevance, interjection } = useAssistant();
  const { open: openProfile } = useAdvisorProfile();
  useEffect(() => {
    setMeetingRunning(["preparing", "discussion", "resolution", "human_input"].includes(phase));
    return () => setMeetingRunning(false);
  }, [phase, setMeetingRunning]);

  // Resurfacing's one trigger point (Phase D): the founder composing a
  // question, debounced — never a timer, never on load. Only while genuinely
  // idle (not mid-meeting), only past a minimum length, and skipped once
  // this session already has an interjection (the budget is enforced
  // server-side too, but no reason to keep spending an embedding call on
  // every pause once it's spent for the day).
  useEffect(() => {
    if (phase !== "idle" || interjection || question.trim().length < 15) return;
    const t = setTimeout(() => checkNoteRelevance(companyId, question), 800);
    return () => clearTimeout(t);
  }, [question, phase, companyId, interjection, checkNoteRelevance]);

  // The Chair opens and writes the resolution; she never debates, so she's
  // never selectable. A board without one gets the built-in Chair.
  const boardChair = findChair(advisors);
  const chair = chairOrBuiltIn(advisors);
  const aiAdvisors = advisors.filter((a) => a.type !== "human" && a.id !== boardChair?.id);
  const humanAdvisors = advisors.filter((a) => a.type === "human");

  // Who attends: as seated on the Boardroom's table when the founder came
  // from there, otherwise the whole board, up to the server's per-meeting
  // limit of MAX_DEBATERS debaters.
  useEffect(() => {
    // A meeting picked up again keeps the advisors it started with.
    if (resumingRef.current) {
      const known = new Set(advisors.map((a) => a.id));
      setSelectedIds((loadedMeeting.participant_advisor_ids || []).filter((id) => known.has(id)));
      return;
    }
    if (initialSelectedIds) {
      const known = new Set(advisors.map((a) => a.id));
      setSelectedIds(initialSelectedIds.filter((id) => known.has(id)));
      // The founder already chose these seats on the table: a click here
      // adjusts them rather than starting over from one advisor.
      setHasInteracted(true);
      return;
    }
    setSelectedIds(aiAdvisors.slice(0, MAX_DEBATERS).map((a) => a.id));
  }, [advisors, initialSelectedIds]);

  // Seats are fixed once for a meeting picked up again, as for a new one.
  useEffect(() => {
    if (resumingRef.current && selectedIds?.length && !Object.keys(seatAssignment).length)
      setSeatAssignment(assignChairs(aiAdvisors.filter((a) => selectedIds.includes(a.id)), chair));
  }, [selectedIds, advisors]); // aiAdvisors and chair derive from advisors

  // The server runs the meeting (P0); the page follows the meeting row: the
  // Chair's opening and each answer as it arrives, and the step it's on.
  useEffect(() => {
    if (!LIVE_PHASES.includes(phase) || !pendingMeetingId) return;
    let cancelled = false;
    const poll = async () => {
      const { data: m } = await supabase.from("board_meetings").select("*").eq("id", pendingMeetingId).maybeSingle();
      if (cancelled || !m) return;
      setLiveRow(m);
      if (m.chair_opening) setChairOpening((prev) => prev || m.chair_opening);
      if (m.discussion_transcript?.length) growTranscript(m.discussion_transcript);
      else if (m.independent_responses?.length) growTranscript(toRoundOneMessages(m.independent_responses));
      const next = meetingPhase(m);
      if (next === "result") {
        const final = { ...m, meeting_id: m.id };
        setResult(final);
        setPhase("result");
        if (!resultSentRef.current) { resultSentRef.current = true; onResultRef.current?.(final); }
      } else if (next === "failed" || next === "superseded") {
        setError(next === "superseded" ? "This meeting was replaced by a newer one." : m.failure_reason || "The board couldn't finish this meeting.");
        setFailedMeetingId(next === "failed" ? m.id : null);
        setPhase("idle");
      } else if (next && next !== phase && !(next === "human_input" && humansSentRef.current)) {
        setPhase(next);
      }
    };
    poll().catch(() => {});
    const t = setInterval(() => poll().catch(() => {}), POLL_INTERVAL_MS);
    return () => { cancelled = true; clearInterval(t); };
  }, [phase, pendingMeetingId, growTranscript]);

  const toggleAdvisor = (a) => {
    let next;
    if (!hasInteracted) { next = [a.id]; setHasInteracted(true); }
    else { next = selectedIds.includes(a.id) ? selectedIds.filter((id) => id !== a.id) : [...selectedIds, a.id]; }
    setSelectedIds(next);
    // Keep the Boardroom's table in step with changes made here.
    onSelectionChange?.(next);
  };

  const selectedAiAdvisors = aiAdvisors.filter((a) => selectedIds?.includes(a.id));
  const selectedHumanAdvisors = humanAdvisors.filter((a) => selectedIds?.includes(a.id));

  // The human advisors' views are in (or skipped): the server carries on.
  const continueToDiscussion = async (meetingId, humanPerspectives = []) => {
    try {
      // Merge human perspectives into the meeting's independent responses
      if (humanPerspectives.length > 0) {
        const meeting = await base44.entities.BoardMeeting.get(meetingId);
        // Sent again after a failed try: each person's view is kept once.
        const sent = new Set(humanPerspectives.map((p) => p.advisor_id));
        const updatedResponses = [...(meeting.independent_responses || []).filter((r) => !sent.has(r.advisor_id)), ...humanPerspectives];
        await base44.entities.BoardMeeting.update(meetingId, { independent_responses: updatedResponses });
        setLiveTranscript(toRoundOneMessages(updatedResponses));
      }
      humansSentRef.current = true;
      await continueMeeting(meetingId);
      setError(null);
      setPhase("discussion");
    } catch (e) {
      // The meeting is still waiting for these views: stay on this step so
      // the founder can send them again.
      humansSentRef.current = false;
      setError(e.message || "The board could not carry on.");
    }
  };

  const newQuestion = () => {
    resumingRef.current = false;
    setPhase("idle"); setQuestion(""); setResult(null); setLiveTranscript([]); setSeatAssignment({}); setChairOpening(null);
    // The finished meeting leaves the address, so a refresh starts fresh.
    if (!freeAttemptId) {
      const url = new URL(window.location.href);
      url.searchParams.delete("meeting");
      window.history.replaceState(window.history.state, "", url);
    }
  };

  // A meeting that stopped: the Chair tries the resolution again.
  const tryAgain = async () => {
    const id = failedMeetingId;
    setError(null); setFailedMeetingId(null);
    try {
      await retryMeeting(id);
      setPendingMeetingId(id);
      setShowResult(false);
      setPhase("resolution");
    } catch (e) {
      setError(e.message);
    }
  };

  const start = async () => {
    if (!question.trim()) return;
    if (selectedAiAdvisors.length < MIN_DEBATERS) { setError(`Select at least ${MIN_DEBATERS} advisors to debate.`); return; }
    if (selectedAiAdvisors.length > MAX_DEBATERS) { setError(`Select at most ${MAX_DEBATERS} advisors to debate.`); return; }
    setPhase("preparing"); setError(null); setFailedMeetingId(null); setResult(null); setLiveTranscript([]); setChairOpening(null);
    setStartedAt(new Date()); setShowResult(false);
    resultSentRef.current = false;
    humansSentRef.current = false;
    resumingRef.current = false;
    const meetingId = crypto.randomUUID();
    setPendingMeetingId(meetingId);
    setLiveRow(null);
    // In the address, so a refresh or a reopened tab picks the meeting up
    // again. (The free meeting page has its own address.)
    if (!freeAttemptId) {
      const url = new URL(window.location.href);
      url.searchParams.set("meeting", meetingId);
      window.history.replaceState(window.history.state, "", url);
    }
    setSeatAssignment(assignChairs(selectedAiAdvisors, chair));
    try {
      // The server runs the meeting from here; the page follows it. With
      // human advisors seated, it waits after Round 1 for their views.
      const started = await startMeeting({
        companyId, question, advisorIds: selectedAiAdvisors.map((a) => a.id), freeAttemptId, meetingId,
        awaitHumans: selectedHumanAdvisors.length > 0,
        // Visitors on the free meeting always get Quick.
        pace: !freeAttemptId ? pace : "quick",
        turnShape: !freeAttemptId && turnShapeAsked(),
        beforeNote: !freeAttemptId && paceOffered ? beforeNote : "",
      });
      // The Assistant routed this question in from a captured note — the
      // note only learns its meeting_id now that a real meeting exists.
      if (routeFromNoteId) {
        base44.entities.Note.update(routeFromNoteId, { routed_meeting_id: started.meeting_id, status: "routed" }).catch(() => {});
      }
    } catch (e) {
      setError(e.message || "The board could not convene.");
      setPhase("idle");
    }
  };

  // Arriving from the Boardroom front door with a question already typed and
  // confirmed — skip the manual "Start Board Debate" click rather than making
  // the founder submit the same question twice.
  const autoStartedRef = useRef(false);
  useEffect(() => {
    if (!autoStart || autoStartedRef.current) return;
    if (phase !== "idle" || !question.trim() || !selectedIds) return;
    if (selectedAiAdvisors.length < MIN_DEBATERS || selectedAiAdvisors.length > MAX_DEBATERS) return;
    autoStartedRef.current = true;
    start();
  }, [autoStart, phase, question, selectedIds, selectedAiAdvisors.length]);

  const handleHumanPerspectives = async (perspectives) => {
    await continueToDiscussion(pendingMeetingId, perspectives);
  };

  const skipHumanInput = async () => {
    await continueToDiscussion(pendingMeetingId, []);
  };

  // A meeting just run carries meeting_id; one opened from a link (?meeting=)
  // is the stored row, which carries id.
  const resultMeetingId = result?.meeting_id || result?.id;

  const recordDecision = async () => {
    const d = await base44.entities.Decision.create({
      company_id: companyId, meeting_id: resultMeetingId, question,
      participants: result?.independent_responses?.map((r) => r.advisor_name) || [],
      summary: result?.board_resolution?.executive_summary,
      final_recommendation: result?.board_resolution?.recommended_direction,
      risks: result?.board_resolution?.main_risks || [],
      confidence_level: result?.board_resolution?.overall_confidence_score,
      status: "pending",
    });
    embedDecisionInBackground(d.id);
    navigate(`/company/${companyId}/decisions?id=${d.id}`);
  };

  const handleFollowup = async (message) => {
    if (!resultMeetingId) return;
    const res = await runFounderFollowup(resultMeetingId, message);
    setResult((prev) => ({ ...prev, discussion_transcript: res.discussion_transcript }));
  };

  const debaterCountOk = selectedAiAdvisors.length >= MIN_DEBATERS && selectedAiAdvisors.length <= MAX_DEBATERS;

  // "Pin this" on a live turn: the founder's own boards only (the free
  // meeting has no pins).
  const pinTurn = !isAnonymous && !freeAttemptId && pendingMeetingId ? (m) => createPin({
    selected_text: m.message,
    surrounding_context: m.message,
    source_type: m.round === 1 ? "advisor_perspective" : "executive_discussion",
    source_id: pendingMeetingId,
    source_title: question,
    source_url: `/company/${companyId}/boardroom?meeting=${pendingMeetingId}`,
    advisor_id: m.advisor_id,
    meeting_id: pendingMeetingId,
    company_id: companyId,
  }) : null;

  if (aiAdvisors.length < MIN_DEBATERS && phase === "idle") {
    return (
      <EmptyState
        title="Convene at least three advisors"
        description="A board debate needs differing perspectives. Invite at least three AI advisors to your board, besides the Chair."
        action={<Button onClick={() => navigate(`/company/${companyId}/team`)} variant="primary" className="px-6">Go to Your advisors</Button>}
      />
    );
  }

  // Human perspective step
  if (phase === "human_input") {
    return (
      <>
      {error && <p className="text-center text-sm text-destructive mb-3">{error}</p>}
      <HumanPerspectiveStep
        humanAdvisors={selectedHumanAdvisors}
        question={question}
        onSubmit={handleHumanPerspectives}
        onSkip={skipHumanInput}
      />
      </>
    );
  }

  // In session (and a finished meeting still playing back): the live room.
  if (phase !== "idle" && !(phase === "result" && showResult)) {
    return (
      <>
      <LiveMeeting
        phase={phase}
        question={question}
        startedAt={startedAt}
        chair={chair}
        debaters={selectedAiAdvisors}
        seatAssignment={seatAssignment}
        transcript={liveTranscript}
        chairOpening={chairOpening}
        advisors={advisors}
        onOpenProfile={openProfile}
        maxRounds={Number.isInteger(liveRow?.rounds_target) ? liveRow.rounds_target : maxRounds}
        onPin={pinTurn}
        before={beforeMeetingNote(liveRow)}
        onFinished={finishPlayback}
        waitingForYou={!!liveRow?.waiting_for_founder}
      />
      {pendingMeetingId && liveRow?.driver === "server" && liveRow?.pace === "sit_in" && ["preparing", "discussion", "resolution"].includes(phase) && (
        <OpenDoor meetingId={pendingMeetingId} row={liveRow} debaters={selectedAiAdvisors} isAnonymous={isAnonymous || !!freeAttemptId}
          besideSidebar={!freeAttemptId} maxRounds={maxRounds} />
      )}
      </>
    );
  }

  if (phase !== "result") {
    return (
      <div className="max-w-3xl">
        <BoardroomBanner className="h-[200px] sm:h-[280px] rounded-md border-2 border-foreground mb-6 rise-in" />
        <div className="bg-card border border-border/70 rounded-3xl p-6 sm:p-10 mb-8 rise-in">
          <AdvisorSelectionRow advisors={[...aiAdvisors, ...humanAdvisors]} selectedIds={selectedIds || []} onToggle={toggleAdvisor} chair={chair} />
          <p className="text-center text-xs text-muted-foreground mt-4">
            {selectedAiAdvisors.length} debating{selectedHumanAdvisors.length > 0 && `, ${selectedHumanAdvisors.length} human`}
            {selectedAiAdvisors.length < MIN_DEBATERS && ` · At least ${MIN_DEBATERS} AI advisors must debate`}
            {selectedAiAdvisors.length > MAX_DEBATERS && ` · At most ${MAX_DEBATERS} can debate`}
          </p>
          {error && <p className="text-center text-sm text-destructive mt-2">{error}</p>}
          {failedMeetingId && (
            <div className="text-center mt-2">
              <Button variant="secondaryOutline" onClick={tryAgain}>Try the resolution again</Button>
            </div>
          )}
          <div className="max-w-xl mx-auto mt-8">
            <Textarea value={question} onChange={(e) => setQuestion(e.target.value)} rows={3}
              placeholder="Ask your board a strategic question…"
              className="text-base resize-none bg-background rounded-2xl" />
            <div className="flex flex-wrap gap-2 mt-3">
              {suggestedQuestionsFor(company).map((p) => (
                <button key={p} onClick={() => setQuestion(p)} className="text-xs text-left text-muted-foreground bg-secondary hover:bg-accent rounded-2xl px-3 py-1.5 transition-colors">{p}</button>
              ))}
            </div>
            {paceOffered && !freeAttemptId && <BeforeNote value={beforeNote} onChange={setBeforeNote} className="mt-4" />}
            {paceOffered && !freeAttemptId && <PaceChoice pace={pace} onChange={setPace} className="mt-4" />}
            <Button onClick={start} disabled={!question.trim() || !debaterCountOk} variant="primary" className="w-full mt-4 h-11">
              <Landmark className="w-4 h-4" /> Convene the board
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <p className="font-display text-xl max-w-2xl">"{question}"</p>
        <Button variant="secondaryOutline" className="shrink-0" onClick={newQuestion}>New question</Button>
      </div>
      <MeetingResult result={result} advisors={advisors.filter((a) => selectedIds?.includes(a.id) || a.id === boardChair?.id)} companyId={companyId} onRecordDecision={isAnonymous ? undefined : recordDecision} onFollowup={isAnonymous ? undefined : handleFollowup} isAnonymous={isAnonymous} />
    </div>
  );
}