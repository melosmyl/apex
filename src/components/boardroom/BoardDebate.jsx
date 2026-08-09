import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Landmark, Sparkles, Users } from "lucide-react";
import EmptyState from "@/components/EmptyState";
import BoardTable from "@/components/boardroom/BoardTable";
import MeetingResult from "@/components/boardroom/MeetingResult";
import HumanPerspectiveStep from "@/components/boardroom/HumanPerspectiveStep";
import LiveDiscussion from "@/components/boardroom/LiveDiscussion";
import ChairOpeningNote from "@/components/boardroom/ChairOpeningNote";
import { startMeeting, runDiscussion, runResolution, runFounderFollowup, embedDecisionInBackground } from "@/lib/boardroom";

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

export default function BoardDebate({ company, companyId, advisors, initialQuestion, loadedMeeting, autoStart }) {
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

  const aiAdvisors = advisors.filter((a) => a.type !== "human");
  const humanAdvisors = advisors.filter((a) => a.type === "human");

  useEffect(() => {
    setSelectedIds(aiAdvisors.map((a) => a.id));
  }, [advisors]);

  useEffect(() => {
    if (phase !== "preparing" || !advisors?.length) return;
    const participants = advisors.filter((a) => selectedIds?.includes(a.id));
    if (!participants.length) return;
    let i = 0;
    const t = setInterval(() => { setActiveName(participants[i % participants.length].name); i++; }, 2000);
    return () => clearInterval(t);
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
    } catch (e) {
      setError(e.message || "The board could not convene.");
      setPhase("idle");
    }
  };

  const start = async () => {
    if (!question.trim()) return;
    if (selectedAiAdvisors.length < 3) { setError("Select at least 3 AI advisors."); return; }
    setPhase("preparing"); setError(null); setResult(null); setLiveTranscript([]); setResolutionStartedAt(null); setChairOpening(null);
    try {
      const phase1 = await startMeeting({ companyId, question, advisorIds: selectedAiAdvisors.map((a) => a.id) });
      setPendingMeetingId(phase1.meeting_id);
      setLiveTranscript(toRoundOneMessages(phase1.independent_responses));
      setChairOpening(phase1.chair_opening || null);
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
    if (selectedAiAdvisors.length < 3) return;
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

  const selectedCount = selectedIds?.length || 0;

  if (aiAdvisors.length < 3 && phase === "idle") {
    return (
      <EmptyState
        icon={Users}
        title="Convene at least three advisors"
        description="A board debate needs differing perspectives. Invite at least three AI advisors to your executive team."
        action={<Button onClick={() => navigate(`/company/${companyId}/team`)} className="rounded-full px-6">Go to Executive Team</Button>}
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
        <div className="bg-card border border-border/70 rounded-3xl p-6 sm:p-10 mb-8 rise-in">
          <BoardTable advisors={advisors} activeName={activeName} selectedIds={selectedIds || []} onToggle={toggleAdvisor} />
          <p className="text-center text-xs text-muted-foreground mt-4">
            {selectedCount} attending · {selectedAiAdvisors.length} AI{selectedHumanAdvisors.length > 0 && `, ${selectedHumanAdvisors.length} human`}
            {selectedAiAdvisors.length < 3 && " · At least 3 AI advisors required"}
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
                <Button onClick={start} disabled={!question.trim() || selectedAiAdvisors.length < 3} className="w-full mt-4 rounded-full h-11">
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
                      <p className="text-sm text-muted-foreground mt-2">{activeName} is evaluating…</p>
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
        <Button variant="outline" className="rounded-full shrink-0" onClick={() => { setPhase("idle"); setQuestion(""); setResult(null); setLiveTranscript([]); }}>New question</Button>
      </div>
      <MeetingResult result={result} advisors={advisors.filter((a) => selectedIds?.includes(a.id))} companyId={companyId} onRecordDecision={recordDecision} onFollowup={handleFollowup} />
    </div>
  );
}