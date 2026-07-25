import React, { useEffect, useState } from "react";
import { useParams, useNavigate, useOutletContext } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Landmark, Users, Sparkles } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import BoardTable from "@/components/boardroom/BoardTable";
import MeetingResult from "@/components/boardroom/MeetingResult";
import { startMeeting, runDiscussion, runResolution, runFounderFollowup } from "@/lib/boardroom";

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

export default function Boardroom() {
  const { companyId } = useParams();
  const { company } = useOutletContext();
  const navigate = useNavigate();
  const [advisors, setAdvisors] = useState(null);
  const [selectedIds, setSelectedIds] = useState(null);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [question, setQuestion] = useState("");
  const [phase, setPhase] = useState("idle");
  const [activeName, setActiveName] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    base44.entities.Advisor.filter({ company_id: companyId }, "-created_date", 100).then((advs) => {
      setAdvisors(advs);
      setSelectedIds(advs.filter(a => a.type !== "human").map(a => a.id));
    });
  }, [companyId]);

  useEffect(() => {
    const meetingId = new URLSearchParams(window.location.search).get("meeting");
    if (!meetingId) return;
    base44.entities.BoardMeeting.get(meetingId).then((m) => {
      if (m) {
        setResult(m);
        setQuestion(m.question || "");
        setPhase("result");
      }
    }).catch(() => {});
  }, [companyId]);

  useEffect(() => {
    if (phase !== "preparing" || !advisors?.length) return;
    const participants = advisors.filter(a => selectedIds?.includes(a.id));
    if (!participants.length) return;
    let i = 0;
    const t = setInterval(() => { setActiveName(participants[i % participants.length].name); i++; }, 2000);
    return () => clearInterval(t);
  }, [phase, advisors, selectedIds]);

  const toggleAdvisor = (a) => {
    if (!hasInteracted) { setSelectedIds([a.id]); setHasInteracted(true); }
    else { setSelectedIds(prev => prev.includes(a.id) ? prev.filter(id => id !== a.id) : [...prev, a.id]); }
  };

  const start = async () => {
    if (!question.trim()) return;
    const selected = advisors.filter(a => selectedIds?.includes(a.id) && a.type !== "human");
    if (selected.length < 3) { setError("Select at least 3 advisors."); return; }
    setPhase("preparing"); setError(null); setResult(null);
    try {
      const phase1 = await startMeeting({ companyId, question, advisorIds: selected.map(a => a.id) });
      setPhase("discussion");
      await runDiscussion(phase1.meeting_id);
      setPhase("resolution");
      const final = await runResolution(phase1.meeting_id);
      setResult(final);
      setPhase("result");
      setActiveName(null);
    } catch (e) {
      setError(e.message || "The board could not convene.");
      setPhase("idle");
    }
  };

  const recordDecision = async () => {
    const d = await base44.entities.Decision.create({
      company_id: companyId, meeting_id: result?.meeting_id, question,
      participants: result?.independent_responses?.map(r => r.advisor_name) || [],
      summary: result?.board_resolution?.executive_summary,
      final_recommendation: result?.board_resolution?.recommended_direction,
      risks: result?.board_resolution?.main_risks || [],
      confidence_level: result?.board_resolution?.overall_confidence_score,
      status: "pending",
    });
    navigate(`/company/${companyId}/decisions?id=${d.id}`);
  };

  const handleFollowup = async (message) => {
    if (!result?.meeting_id) return;
    const res = await runFounderFollowup(result.meeting_id, message);
    setResult(prev => ({ ...prev, discussion_transcript: res.discussion_transcript }));
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

  return (
    <div>
      <PageHeader eyebrow="The signature experience" title="The Boardroom"
        description="Pose a strategic question. Your advisors will debate it — and reach a recommendation." />

      {phase !== "result" && (
        <div className="bg-card border border-border/50 rounded-[var(--radius)] p-8 sm:p-12 mb-8 shadow-card rise-in">
          <BoardTable advisors={advisors} activeName={activeName} selectedIds={selectedIds || []} onToggle={toggleAdvisor} />
          <p className="text-center text-xs text-muted-foreground mt-5 tracking-wide">
            {selectedCount} attending{selectedCount < 3 && " · At least 3 required"}
          </p>
          {error && <p className="text-center text-sm text-destructive mt-2">{error}</p>}
          <div className="max-w-xl mx-auto mt-10">
            {phase === "idle" ? (
              <>
                <Textarea value={question} onChange={e => setQuestion(e.target.value)} rows={3}
                  placeholder="Ask your board a strategic question…"
                  className="text-base resize-none bg-background/50 rounded-xl leading-relaxed" />
                <div className="flex flex-wrap gap-2 mt-4">
                  {PROMPTS.map(p => (
                    <button key={p} onClick={() => setQuestion(p)} className="text-xs text-muted-foreground bg-secondary/60 hover:bg-accent/60 rounded-full px-3.5 py-1.5 transition-all duration-300">{p}</button>
                  ))}
                </div>
                <Button onClick={start} disabled={!question.trim() || selectedCount < 3} className="w-full mt-6 h-12 text-base">
                  <Landmark className="w-4 h-4 mr-2" strokeWidth={1.5} /> Start Board Meeting
                </Button>
              </>
            ) : (
              <div className="text-center py-12">
                <div className="inline-flex items-center gap-2 text-muted-foreground">
                  <Sparkles className="w-4 h-4 animate-pulse" strokeWidth={1.5} />
                  <span className="font-display text-xl font-normal">{PHASE_MESSAGES[phase]}</span>
                </div>
                {phase === "preparing" && activeName && (
                  <p className="text-sm text-muted-foreground mt-3">{activeName} is evaluating…</p>
                )}
                <p className="font-display text-lg mt-6 max-w-md mx-auto text-muted-foreground italic">"{question}"</p>
              </div>
            )}
          </div>
        </div>
      )}

      {phase === "result" && result && (
        <div>
          <div className="flex items-center justify-between mb-10">
            <p className="font-display text-xl sm:text-2xl max-w-2xl font-normal leading-snug">"{question}"</p>
            <Button variant="outline" className="shrink-0" onClick={() => { setPhase("idle"); setQuestion(""); setResult(null); }}>New question</Button>
          </div>
          <MeetingResult result={result} advisors={advisors.filter(a => selectedIds?.includes(a.id))} companyId={companyId} onRecordDecision={recordDecision} onFollowup={handleFollowup} />
        </div>
      )}
    </div>
  );
}