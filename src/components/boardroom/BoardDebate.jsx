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
import { usePin } from "@/components/pins/PinContext";
import { startMeeting, runDiscussion, runResolution, runFounderFollowup, embedDecisionInBackground, assignChairs, MAX_DEBATERS, MIN_DEBATERS, suggestedQuestionsFor } from "@/lib/boardroom";
import { findChair, chairOrBuiltIn } from "@/lib/chair";
import { useAdvisorProfile } from "@/components/advisors/AdvisorProfilePanel";
import { useAssistant } from "@/lib/AssistantContext";

const POLL_INTERVAL_MS = 3000;

function toRoundOneMessages(responses = []) {
  return responses.map((r) => ({
    round: 1,
    advisor_id: r.advisor_id,
    advisor_name: r.advisor_name,
    role: r.role,
    message: r.position || r.recommendation || "",
    message_type: "initial",
    reply_to_advisor: null,
    changed_opinion: false,
    new_position: null,
    new_risks: r.risks || [],
    confidence_score: r.confidence_score || 0,
    unavailable: r.unavailable || false,
  }));
}



export default function BoardDebate({ company, companyId, advisors, initialQuestion, initialSelectedIds, onSelectionChange, loadedMeeting, autoStart, onResult, onResultShown, routeFromNoteId, freeAttemptId }) {
  const navigate = useNavigate();
  const [selectedIds, setSelectedIds] = useState(null);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [question, setQuestion] = useState(initialQuestion || "");
  const [phase, setPhase] = useState(loadedMeeting ? "result" : "idle");
  const [result, setResult] = useState(loadedMeeting || null);
  const [error, setError] = useState(null);
  const [pendingMeetingId, setPendingMeetingId] = useState(null);
  const [liveTranscript, setLiveTranscript] = useState([]);
  // When this meeting was convened, for the "Meeting in session" line.
  const [startedAt, setStartedAt] = useState(null);
  // The id of the meeting being convened, chosen here before startMeeting
  // runs, so the live view can follow exactly this meeting while it forms.
  const [formingId, setFormingId] = useState(null);
  // A finished meeting's result shows once the live playback has caught up
  // (or the founder skips ahead); a loaded past meeting shows straight away.
  const [showResult, setShowResult] = useState(!!loadedMeeting);
  const finishPlayback = useCallback(() => { setShowResult(true); onResultShown?.(); }, [onResultShown]);
  // How many rounds a discussion can run, as the engine reads it.
  const [maxRounds, setMaxRounds] = useState(3);
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

  // While Round 1 forms, the engine saves the Chair's opening and each
  // advisor's answer as it arrives; show them as they come instead of
  // waiting for the slowest advisor.
  useEffect(() => {
    if (phase !== "preparing" || !formingId) return;
    let cancelled = false;
    const poll = async () => {
      const { data } = await supabase
        .from("board_meetings")
        .select("chair_opening, independent_responses")
        .eq("id", formingId)
        .maybeSingle();
      if (cancelled || !data) return;
      if (data.chair_opening) setChairOpening((prev) => prev || data.chair_opening);
      if (data.independent_responses?.length) growTranscript(toRoundOneMessages(data.independent_responses));
    };
    const t = setInterval(() => poll().catch(() => {}), 2000);
    return () => { cancelled = true; clearInterval(t); };
  }, [phase, formingId, growTranscript]);

  useEffect(() => {
    if (phase !== "discussion" || !pendingMeetingId) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const meeting = await base44.entities.BoardMeeting.get(pendingMeetingId);
        if (!cancelled) growTranscript(meeting?.discussion_transcript);
      } catch {
        // A dropped poll is cosmetic — the discussion continues server-side regardless.
      }
    };
    poll();
    const t = setInterval(poll, POLL_INTERVAL_MS);
    return () => { cancelled = true; clearInterval(t); };
  }, [phase, pendingMeetingId]);

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

  const continueToDiscussion = async (meetingId, humanPerspectives = []) => {
    setPhase("discussion");
    try {
      // Merge human perspectives into the meeting's independent responses
      if (humanPerspectives.length > 0) {
        const meeting = await base44.entities.BoardMeeting.get(meetingId);
        const updatedResponses = [...(meeting.independent_responses || []), ...humanPerspectives];
        await base44.entities.BoardMeeting.update(meetingId, { independent_responses: updatedResponses });
        setLiveTranscript(toRoundOneMessages(updatedResponses));
      }
      const discussed = await runDiscussion(meetingId);
      // The poll stops with the discussion, and the last round can land
      // between two polls: the engine returns the finished transcript, so
      // the live view plays every round.
      growTranscript(discussed?.discussion_transcript);
      setPhase("resolution");
      const final = await runResolution(meetingId);
      setResult(final);
      setPhase("result");
      onResult?.(final);
    } catch (e) {
      setError(e.message || "The board could not convene.");
      setPhase("idle");
    }
  };

  const start = async () => {
    if (!question.trim()) return;
    if (selectedAiAdvisors.length < MIN_DEBATERS) { setError(`Select at least ${MIN_DEBATERS} advisors to debate.`); return; }
    if (selectedAiAdvisors.length > MAX_DEBATERS) { setError(`Select at most ${MAX_DEBATERS} advisors to debate.`); return; }
    setPhase("preparing"); setError(null); setResult(null); setLiveTranscript([]); setChairOpening(null);
    setStartedAt(new Date()); setShowResult(false);
    const meetingId = crypto.randomUUID();
    setFormingId(meetingId);
    setSeatAssignment(assignChairs(selectedAiAdvisors, chair));
    try {
      const phase1 = await startMeeting({ companyId, question, advisorIds: selectedAiAdvisors.map((a) => a.id), freeAttemptId, meetingId });
      setPendingMeetingId(phase1.meeting_id);
      growTranscript(toRoundOneMessages(phase1.independent_responses));
      setChairOpening(phase1.chair_opening || null);
      // The Assistant routed this question in from a captured note — the
      // note only learns its meeting_id now that a real meeting exists.
      if (routeFromNoteId) {
        base44.entities.Note.update(routeFromNoteId, { routed_meeting_id: phase1.meeting_id, status: "routed" }).catch(() => {});
      }
      // If human advisors are selected, show the human perspective step
      if (selectedHumanAdvisors.length > 0) {
        setPhase("human_input");
      } else {
        await continueToDiscussion(phase1.meeting_id);
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

  const recordDecision = async () => {
    const d = await base44.entities.Decision.create({
      company_id: companyId, meeting_id: result?.meeting_id, question,
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
    if (!result?.meeting_id) return;
    const res = await runFounderFollowup(result.meeting_id, message);
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
      <HumanPerspectiveStep
        humanAdvisors={selectedHumanAdvisors}
        question={question}
        onSubmit={handleHumanPerspectives}
        onSkip={skipHumanInput}
      />
    );
  }

  // In session (and a finished meeting still playing back): the live room.
  if (phase !== "idle" && !(phase === "result" && showResult)) {
    return (
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
        maxRounds={maxRounds}
        onPin={pinTurn}
        onFinished={finishPlayback}
      />
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
          <div className="max-w-xl mx-auto mt-8">
            <Textarea value={question} onChange={(e) => setQuestion(e.target.value)} rows={3}
              placeholder="Ask your board a strategic question…"
              className="text-base resize-none bg-background rounded-2xl" />
            <div className="flex flex-wrap gap-2 mt-3">
              {suggestedQuestionsFor(company).map((p) => (
                <button key={p} onClick={() => setQuestion(p)} className="text-xs text-left text-muted-foreground bg-secondary hover:bg-accent rounded-2xl px-3 py-1.5 transition-colors">{p}</button>
              ))}
            </div>
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
        <Button variant="secondaryOutline" className="shrink-0" onClick={() => { setPhase("idle"); setQuestion(""); setResult(null); setLiveTranscript([]); setSeatAssignment({}); setChairOpening(null); }}>New question</Button>
      </div>
      <MeetingResult result={result} advisors={advisors.filter((a) => selectedIds?.includes(a.id) || a.id === boardChair?.id)} companyId={companyId} onRecordDecision={isAnonymous ? undefined : recordDecision} onFollowup={isAnonymous ? undefined : handleFollowup} isAnonymous={isAnonymous} />
    </div>
  );
}