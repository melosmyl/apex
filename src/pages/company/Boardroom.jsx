import React, { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate, useOutletContext } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Landmark, Users, Sparkles, Send, Play } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import BoardTable from "@/components/boardroom/BoardTable";
import MeetingResult from "@/components/boardroom/MeetingResult";
import ConversationView from "@/components/boardroom/ConversationView";
import { startMeeting, runDiscussionTurn, runResolution } from "@/lib/boardroom";

const PROMPTS = [
  "Should we manufacture our products in Portugal or Vietnam?",
  "Is now the right time to raise a funding round?",
  "Should we launch a premium tier or stay focused on our core product?",
];

const PHASE_MESSAGES = {
  preparing: "The Chair is opening the meeting and inviting initial positions",
  discussing: "The board is in active discussion",
  resolution: "The Chair is preparing the resolution",
};

export default function Boardroom() {
  const { companyId } = useParams();
  const { company } = useOutletContext();
  const navigate = useNavigate();
  const [advisors, setAdvisors] = useState(null);
  const [selectedIds, setSelectedIds] = useState(null);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [question, setQuestion] = useState("");
  const [phase, setPhase] = useState("idle");
  const [transcript, setTranscript] = useState([]);
  const [result, setResult] = useState(null);
  const [meetingId, setMeetingId] = useState(null);
  const [error, setError] = useState(null);

  // User participation
  const [userInput, setUserInput] = useState("");
  const [addressedTo, setAddressedTo] = useState(null);
  const [isPaused, setIsPaused] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const isProcessingRef = useRef(false);

  useEffect(() => {
    base44.entities.Advisor.filter({ company_id: companyId }, "-created_date", 100).then((advs) => {
      setAdvisors(advs);
      setSelectedIds(advs.filter(a => a.type !== "human").map(a => a.id));
    });
  }, [companyId]);

  const toggleAdvisor = (a) => {
    if (!hasInteracted) { setSelectedIds([a.id]); setHasInteracted(true); }
    else { setSelectedIds(prev => prev.includes(a.id) ? prev.filter(id => id !== a.id) : [...prev, a.id]); }
  };

  const start = async () => {
    if (!question.trim()) return;
    const selected = advisors.filter(a => selectedIds?.includes(a.id) && a.type !== "human");
    if (selected.length < 3 || selected.length > 5) { setError("Select between 3 and 5 advisors."); return; }
    setPhase("preparing"); setError(null); setResult(null); setTranscript([]); setMeetingId(null);
    try {
      const phase1 = await startMeeting({ companyId, question, advisorIds: selected.map(a => a.id) });
      setTranscript(phase1.transcript || []);
      setMeetingId(phase1.meeting_id);
      setPhase("discussing");
    } catch (e) {
      setError(e.message || "The board could not convene.");
      setPhase("idle");
    }
  };

  const runNextTurn = useCallback(async (userMessage, addressedToAdvisor) => {
    if (!meetingId || isProcessingRef.current) return;
    isProcessingRef.current = true;
    setIsProcessing(true);
    setError(null);
    try {
      const turn = await runDiscussionTurn(meetingId, userMessage, addressedToAdvisor);
      setTranscript(turn.transcript || []);
      if (turn.status === "ready_for_resolution") {
        setPhase("resolution");
        const final = await runResolution(meetingId);
        setResult(final);
        setTranscript(final.transcript || turn.transcript);
        setPhase("result");
      }
    } catch (e) {
      setError(e.message || "The discussion was interrupted.");
      setIsPaused(true);
    } finally {
      isProcessingRef.current = false;
      setIsProcessing(false);
    }
  }, [meetingId]);

  // Auto-advance discussion when not paused and not processing
  useEffect(() => {
    if (phase !== "discussing" || isPaused || isProcessing) return;
    const timer = setTimeout(() => {
      runNextTurn(null, null);
    }, 3500);
    return () => clearTimeout(timer);
  }, [phase, isPaused, isProcessing, transcript, runNextTurn]);

  const sendUserMessage = async () => {
    if (!userInput.trim() || isProcessingRef.current) return;
    const msg = userInput.trim();
    const target = addressedTo || null;
    setUserInput("");
    setAddressedTo(null);
    setIsPaused(false);
    await runNextTurn(msg, target);
  };

  const continueDiscussion = () => {
    setIsPaused(false);
  };

  const recordDecision = async () => {
    const participants = result?.transcript
      ?.filter(t => t.speaker_type === "advisor")
      .map(t => t.speaker_name)
      .filter((v, i, a) => a.indexOf(v) === i) || [];
    const d = await base44.entities.Decision.create({
      company_id: companyId, meeting_id: result?.meeting_id, question,
      participants,
      summary: result?.board_resolution?.executive_summary,
      final_recommendation: result?.board_resolution?.recommended_direction,
      risks: result?.board_resolution?.main_risks || [],
      confidence_level: result?.board_resolution?.overall_confidence_score,
      status: "pending",
    });
    navigate(`/company/${companyId}/decisions?id=${d.id}`);
  };

  if (advisors === null) return <div className="h-64 rounded-2xl bg-secondary/60 animate-pulse" />;

  const aiAdvisors = advisors.filter(a => a.type !== "human");
  if (aiAdvisors.length < 3) {
    return (
      <div>
        <PageHeader eyebrow="The signature experience" title="The Boardroom" />
        <EmptyState icon={Users} title="Convene at least three advisors"
          description="A board debate needs differing perspectives. Invite at least three AI advisors to your executive team."
          action={<Button onClick={() => navigate(`/company/${companyId}/team`)} className="rounded-full px-6">Go to Executive Team</Button>} />
      </div>
    );
  }

  const selectedCount = selectedIds?.length || 0;
  const selectedAdvisors = advisors.filter(a => selectedIds?.includes(a.id));

  return (
    <div>
      <PageHeader eyebrow="The signature experience" title="The Boardroom"
        description="Pose a strategic question. Your advisors will debate it — and reach a recommendation." />

      {phase === "idle" && (
        <div className="bg-card border border-border/70 rounded-3xl p-6 sm:p-10 mb-8 rise-in">
          <BoardTable advisors={advisors} activeName={null} selectedIds={selectedIds || []} onToggle={toggleAdvisor} />
          <p className="text-center text-xs text-muted-foreground mt-4">
            {selectedCount} attending{selectedCount < 3 && " · At least 3 required"}{selectedCount > 5 && " · Maximum 5"}
          </p>
          {error && <p className="text-center text-sm text-destructive mt-2">{error}</p>}
          <div className="max-w-xl mx-auto mt-8">
            <Textarea value={question} onChange={e => setQuestion(e.target.value)} rows={3}
              placeholder="Ask your board a strategic question…"
              className="text-base resize-none bg-background rounded-2xl" />
            <div className="flex flex-wrap gap-2 mt-3">
              {PROMPTS.map(p => (
                <button key={p} onClick={() => setQuestion(p)} className="text-xs text-muted-foreground bg-secondary hover:bg-accent rounded-full px-3 py-1.5 transition-colors">{p}</button>
              ))}
            </div>
            <Button onClick={start} disabled={!question.trim() || selectedCount < 3 || selectedCount > 5} className="w-full mt-4 rounded-full h-11">
              <Landmark className="w-4 h-4 mr-2" /> Start Board Meeting
            </Button>
          </div>
        </div>
      )}

      {(phase === "preparing" || phase === "discussing" || phase === "resolution") && (
        <div className="bg-card border border-border/70 rounded-2xl p-6 sm:p-8 mb-6 rise-in">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 animate-pulse text-muted-foreground" />
              <span className="font-display text-lg">{PHASE_MESSAGES[phase]}</span>
            </div>
            <p className="font-display text-sm italic text-muted-foreground max-w-md hidden sm:block">"{question}"</p>
          </div>

          {transcript.length > 0 && (
            <ConversationView transcript={transcript} advisors={selectedAdvisors} />
          )}

          {transcript.length === 0 && phase === "preparing" && (
            <div className="text-center py-8">
              <div className="inline-flex items-center gap-2 text-muted-foreground">
                <Sparkles className="w-4 h-4 animate-pulse" />
                <span>Convening the board…</span>
              </div>
            </div>
          )}

          {/* User participation during discussion */}
          {phase === "discussing" && transcript.length > 0 && (
            <div className="mt-6 pt-4 border-t border-border/60">
              <div className="flex flex-wrap gap-1.5 mb-3">
                <button
                  onClick={() => setAddressedTo(null)}
                  className={`text-xs rounded-full px-3 py-1 transition-colors ${!addressedTo ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-accent"}`}
                >
                  Whole board
                </button>
                {selectedAdvisors.filter(a => a.type !== "human").map(a => (
                  <button
                    key={a.id}
                    onClick={() => setAddressedTo(a.name)}
                    className={`text-xs rounded-full px-3 py-1 transition-colors ${addressedTo === a.name ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-accent"}`}
                  >
                    {a.name}
                  </button>
                ))}
              </div>
              <div className="flex flex-col sm:flex-row gap-2 items-start">
                <Textarea
                  value={userInput}
                  onChange={e => setUserInput(e.target.value)}
                  onFocus={() => setIsPaused(true)}
                  rows={2}
                  placeholder={addressedTo ? `Address ${addressedTo}…` : "Address the board…"}
                  className="resize-none bg-background rounded-xl text-sm flex-1"
                />
                <div className="flex gap-2">
                  <Button
                    onClick={sendUserMessage}
                    disabled={!userInput.trim() || isProcessing}
                    size="sm"
                    className="rounded-full"
                  >
                    <Send className="w-4 h-4 mr-1" /> Send
                  </Button>
                  {isPaused && !isProcessing && (
                    <Button onClick={continueDiscussion} variant="outline" size="sm" className="rounded-full">
                      <Play className="w-4 h-4 mr-1" /> Continue
                    </Button>
                  )}
                </div>
              </div>
              {isPaused && !isProcessing && (
                <p className="text-xs text-muted-foreground mt-2">
                  Discussion paused — send your message or click Continue to resume.
                </p>
              )}
              {isProcessing && (
                <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                  <Sparkles className="w-3 h-3 animate-pulse" /> An advisor is responding…
                </p>
              )}
            </div>
          )}

          {error && <p className="text-sm text-destructive mt-4 text-center">{error}</p>}
          {error && phase === "discussing" && (
            <div className="text-center mt-3">
              <Button onClick={() => { setError(null); setIsPaused(false); }} variant="outline" size="sm" className="rounded-full">
                Resume discussion
              </Button>
            </div>
          )}
        </div>
      )}

      {phase === "result" && result && (
        <div>
          <div className="flex items-center justify-between mb-6">
            <p className="font-display text-xl max-w-2xl">"{question}"</p>
            <Button variant="outline" className="rounded-full shrink-0" onClick={() => {
              setPhase("idle"); setQuestion(""); setResult(null); setTranscript([]); setMeetingId(null);
            }}>New question</Button>
          </div>
          <MeetingResult result={result} advisors={selectedAdvisors} companyId={companyId} onRecordDecision={recordDecision} />
        </div>
      )}
    </div>
  );
}