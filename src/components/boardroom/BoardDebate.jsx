import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { base44, supabase } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Landmark, Sparkles } from "lucide-react";
import EmptyState from "@/components/EmptyState";
import BoardroomBanner from "@/components/boardroom/BoardroomBanner";
import AdvisorSelectionRow from "@/components/boardroom/AdvisorSelectionRow";
import MeetingResult from "@/components/boardroom/MeetingResult";
import HumanPerspectiveStep from "@/components/boardroom/HumanPerspectiveStep";
import LiveDiscussion from "@/components/boardroom/LiveDiscussion";
import ChairOpeningNote from "@/components/boardroom/ChairOpeningNote";
import { startMeeting, runDiscussion, runResolution, runFounderFollowup, embedDecisionInBackground, assignChairs, MAX_DEBATERS, MIN_DEBATERS } from "@/lib/boardroom";
import { findChair, chairOrBuiltIn } from "@/lib/chair";
import { useAssistant } from "@/lib/AssistantContext";

const POLL_INTERVAL_MS = 3000;
// How long the Chair's seat is lit at the start, while she opens. The opening
// runs alongside Round 1 in one request, so this is shown, not tracked;
// Phase 1b Stage 3 makes it exact.
const CHAIR_OPENING_LIGHT_MS = 4000;

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

const PROMPTS = [
  "Should we manufacture our products in Portugal or Vietnam?",
  "Is now the right time to raise a funding round?",
  "Should we launch a premium tier or stay focused on our core product?",
];

const PHASE_MESSAGES = {
  preparing: "Reviewing company context",
  discussion: "The board is in executive discussion",
  resolution: "The Chair is preparing the resolution",
};

export default function BoardDebate({ company, companyId, advisors, initialQuestion, loadedMeeting, autoStart, onResult, routeFromNoteId, freeAttemptId }) {
  const navigate = useNavigate();
  const [selectedIds, setSelectedIds] = useState(null);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [question, setQuestion] = useState(initialQuestion || "");
  const [phase, setPhase] = useState(loadedMeeting ? "result" : "idle");
  const [activeName, setActiveName] = useState(null);
  const [result, setResult] = useState(loadedMeeting || null);
  const [error, setError] = useState(null);
  const [pendingMeetingId, setPendingMeetingId] = useState(null);
  const [liveTranscript, setLiveTranscript] = useState([]);
  const [resolutionStartedAt, setResolutionStartedAt] = useState(null);
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

  // Default to the whole board, up to the server's per-meeting limit of
  // MAX_DEBATERS debaters.
  useEffect(() => {
    setSelectedIds(aiAdvisors.slice(0, MAX_DEBATERS).map((a) => a.id));
  }, [advisors]);

  // While positions form: the Chair's seat lights first (she opens), then
  // the debaters' in turn.
  useEffect(() => {
    if (phase !== "preparing" || !advisors?.length) return;
    const participants = aiAdvisors.filter((a) => selectedIds?.includes(a.id));
    if (!participants.length) return;
    setActiveName(chair.name);
    let i = 0;
    let t;
    const opening = setTimeout(() => {
      setActiveName(participants[0].name);
      t = setInterval(() => { i++; setActiveName(participants[i % participants.length].name); }, 2000);
    }, CHAIR_OPENING_LIGHT_MS);
    return () => { clearTimeout(opening); clearInterval(t); };
  }, [phase, advisors, selectedIds]);

  useEffect(() => {
    if (phase !== "discussion" || !pendingMeetingId) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const meeting = await base44.entities.BoardMeeting.get(pendingMeetingId);
        if (!cancelled && meeting?.discussion_transcript?.length) {
          setLiveTranscript(meeting.discussion_transcript);
        }
      } catch {
        // A dropped poll is cosmetic — the discussion continues server-side regardless.
      }
    };
    poll();
    const t = setInterval(poll, POLL_INTERVAL_MS);
    return () => { cancelled = true; clearInterval(t); };
  }, [phase, pendingMeetingId]);

  const toggleAdvisor = (a) => {
    if (!hasInteracted) { setSelectedIds([a.id]); setHasInteracted(true); }
    else { setSelectedIds((prev) => prev.includes(a.id) ? prev.filter((id) => id !== a.id) : [...prev, a.id]); }
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
      await runDiscussion(meetingId);
      setResolutionStartedAt(Date.now());
      setPhase("resolution");
      const final = await runResolution(meetingId);
      setResult(final);
      setPhase("result");
      setActiveName(null);
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
    setPhase("preparing"); setError(null); setResult(null); setLiveTranscript([]); setResolutionStartedAt(null); setChairOpening(null);
    setSeatAssignment(assignChairs(selectedAiAdvisors, chair));
    try {
      const phase1 = await startMeeting({ companyId, question, advisorIds: selectedAiAdvisors.map((a) => a.id), freeAttemptId });
      setPendingMeetingId(phase1.meeting_id);
      setLiveTranscript(toRoundOneMessages(phase1.independent_responses));
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

  // Who currently has the floor: the Chair opening, then debaters in turn
  // while positions form, then the real speaking order as the transcript
  // grows during discussion, then the Chair again while she writes the
  // resolution.
  const activeSpeakerName =
    phase === "preparing" ? activeName :
    phase === "discussion" && liveTranscript.length ? liveTranscript[liveTranscript.length - 1].advisor_name :
    phase === "resolution" ? chair.name :
    null;
  const activeChairId = activeSpeakerName ? seatAssignment[activeSpeakerName] : null;

  // Fixed for the meeting, not just the active speaker — every seated
  // advisor's tag stays mounted with unchanging text the whole time, so
  // handover is a pure opacity crossfade with nothing to swap mid-fade.
  const chairLabels = {};
  for (const [name, chairId] of Object.entries(seatAssignment)) {
    const advisor = name === chair.name ? chair : advisors.find((a) => a.name === name);
    if (advisor) chairLabels[chairId] = { name: advisor.name, role: advisor.role };
  }

  if (aiAdvisors.length < MIN_DEBATERS && phase === "idle") {
    return (
      <EmptyState
        title="Convene at least three advisors"
        description="A board debate needs differing perspectives. Invite at least three AI advisors to your executive team, besides the Chair."
        action={<Button onClick={() => navigate(`/company/${companyId}/team`)} variant="primary" className="px-6">Go to Executive Team</Button>}
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

  if (phase !== "result") {
    return (
      <div className="max-w-3xl">
        <BoardroomBanner
          activeChairId={activeChairId}
          chairLabels={chairLabels}
          className="h-[200px] sm:h-[280px] rounded-2xl mb-6 rise-in"
        />
        <div className="bg-card border border-border/70 rounded-3xl p-6 sm:p-10 mb-8 rise-in">
          <AdvisorSelectionRow advisors={[...aiAdvisors, ...humanAdvisors]} selectedIds={selectedIds || []} onToggle={toggleAdvisor} chair={chair} />
          <p className="text-center text-xs text-muted-foreground mt-4">
            {selectedAiAdvisors.length} debating{selectedHumanAdvisors.length > 0 && `, ${selectedHumanAdvisors.length} human`}
            {selectedAiAdvisors.length < MIN_DEBATERS && ` · At least ${MIN_DEBATERS} AI advisors must debate`}
            {selectedAiAdvisors.length > MAX_DEBATERS && ` · At most ${MAX_DEBATERS} can debate`}
          </p>
          {error && <p className="text-center text-sm text-destructive mt-2">{error}</p>}
          <div className="max-w-xl mx-auto mt-8">
            {phase === "idle" ? (
              <>
                <Textarea value={question} onChange={(e) => setQuestion(e.target.value)} rows={3}
                  placeholder="Ask your board a strategic question…"
                  className="text-base resize-none bg-background rounded-2xl" />
                <div className="flex flex-wrap gap-2 mt-3">
                  {PROMPTS.map((p) => (
                    <button key={p} onClick={() => setQuestion(p)} className="text-xs text-muted-foreground bg-secondary hover:bg-accent rounded-full px-3 py-1.5 transition-colors">{p}</button>
                  ))}
                </div>
                <Button onClick={start} disabled={!question.trim() || !debaterCountOk} variant="primary" className="w-full mt-4 h-11">
                  <Landmark className="w-4 h-4 mr-2" /> Start Board Debate
                </Button>
              </>
            ) : (
              <div className="text-center py-8">
                {!liveTranscript.length && (
                  <>
                    <div className="inline-flex items-center gap-2 text-muted-foreground">
                      <Sparkles className="w-4 h-4 animate-pulse" />
                      <span className="font-display text-lg">{PHASE_MESSAGES[phase]}</span>
                    </div>
                    {phase === "preparing" && activeName && (
                      <p className="text-sm text-muted-foreground mt-2">{activeName === chair.name ? `${chair.name} is opening the meeting…` : `${activeName} is evaluating…`}</p>
                    )}
                  </>
                )}
                <p className="font-display text-base mt-4 max-w-md mx-auto text-muted-foreground italic">"{question}"</p>
              </div>
            )}
          </div>
        </div>
        {chairOpening && <div className="mb-6"><ChairOpeningNote chairOpening={chairOpening} /></div>}
        <LiveDiscussion transcript={liveTranscript} advisors={advisors} phase={phase} resolutionStartedAt={resolutionStartedAt} />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <p className="font-display text-xl max-w-2xl">"{question}"</p>
        <Button variant="secondaryOutline" className="shrink-0" onClick={() => { setPhase("idle"); setQuestion(""); setResult(null); setLiveTranscript([]); setSeatAssignment({}); }}>New question</Button>
      </div>
      <MeetingResult result={result} advisors={advisors.filter((a) => selectedIds?.includes(a.id) || a.id === boardChair?.id)} companyId={companyId} onRecordDecision={isAnonymous ? undefined : recordDecision} onFollowup={isAnonymous ? undefined : handleFollowup} isAnonymous={isAnonymous} />
    </div>
  );
}