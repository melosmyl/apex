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
import { convene } from "@/lib/boardroom";

const PROMPTS = [
  "Should we manufacture our products in Portugal or Vietnam?",
  "Is now the right time to raise a funding round?",
  "Should we launch a premium tier or stay focused on our core product?",
];

export default function Boardroom() {
  const { companyId } = useParams();
  const { company } = useOutletContext();
  const navigate = useNavigate();
  const [advisors, setAdvisors] = useState(null);
  const [question, setQuestion] = useState("");
  const [phase, setPhase] = useState("idle"); // idle | thinking | result
  const [activeName, setActiveName] = useState(null);
  const [result, setResult] = useState(null);
  const [savedMeeting, setSavedMeeting] = useState(null);
  const [recording, setRecording] = useState(false);

  useEffect(() => { base44.entities.Advisor.filter({ company_id: companyId }, "-created_date", 100).then(setAdvisors); }, [companyId]);

  useEffect(() => {
    if (phase !== "thinking" || !advisors?.length) return;
    let i = 0;
    const t = setInterval(() => { setActiveName(advisors[i % advisors.length].name); i++; }, 900);
    return () => clearInterval(t);
  }, [phase, advisors]);

  const start = async () => {
    if (!question.trim()) return;
    setPhase("thinking");
    setResult(null); setSavedMeeting(null);
    try {
      const knowledge = await base44.entities.Document.filter({ company_id: companyId, kind: "knowledge" }, "-created_date", 20);
      const res = await convene({ company, advisors, question, knowledge });
      const meeting = await base44.entities.BoardMeeting.create({
        company_id: companyId, question,
        participants: advisors.map((a) => a.name),
        discussion: res.discussion || [],
        executive_summary: res.executive_summary, recommendation: res.recommendation,
        confidence_score: res.confidence_score, risks: res.risks || [],
        minority_opinion: res.minority_opinion, alternative_strategies: res.alternative_strategies || [],
        next_steps: res.next_steps || [], assigned_tasks: res.assigned_tasks || [],
      });
      if (res.assigned_tasks?.length) {
        await base44.entities.Task.bulkCreate(res.assigned_tasks.map((t) => ({
          company_id: companyId, title: t.title, assigned_to: t.assigned_to, created_by: "Boardroom", status: "todo",
        })));
      }
      setResult(res); setSavedMeeting(meeting); setPhase("result"); setActiveName(null);
    } catch (e) {
      setPhase("idle");
    }
  };

  const recordDecision = async () => {
    setRecording(true);
    const d = await base44.entities.Decision.create({
      company_id: companyId, meeting_id: savedMeeting?.id, question,
      participants: advisors.map((a) => a.name), summary: result.executive_summary,
      final_recommendation: result.recommendation, risks: result.risks || [],
      confidence_level: result.confidence_score, status: "pending",
    });
    navigate(`/company/${companyId}/decisions?id=${d.id}`);
  };

  if (advisors === null) return <div className="h-64 rounded-2xl bg-secondary/60 animate-pulse" />;

  if (advisors.length < 2) {
    return (
      <div>
        <PageHeader eyebrow="The signature experience" title="The Boardroom" />
        <EmptyState icon={Users} title="Convene at least two advisors"
          description="A board debate needs differing perspectives. Invite advisors to your executive team first."
          action={<Button onClick={() => navigate(`/company/${companyId}/team`)} className="rounded-full px-6">Go to Executive Team</Button>} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader eyebrow="The signature experience" title="The Boardroom"
        description="Pose a strategic question. Your advisors will debate it — and reach a recommendation." />

      {phase !== "result" && (
        <div className="bg-card border border-border/70 rounded-3xl p-6 sm:p-10 mb-8 rise-in">
          <BoardTable advisors={advisors} activeName={activeName} />
          <div className="max-w-xl mx-auto mt-8">
            {phase === "thinking" ? (
              <div className="text-center py-4">
                <div className="inline-flex items-center gap-2 text-muted-foreground">
                  <Sparkles className="w-4 h-4 animate-pulse" /> The board is deliberating…
                </div>
                <p className="font-display text-lg mt-3 max-w-md mx-auto">"{question}"</p>
              </div>
            ) : (
              <>
                <Textarea value={question} onChange={(e) => setQuestion(e.target.value)} rows={3}
                  placeholder="Ask your board a strategic question…"
                  className="text-base resize-none bg-background rounded-2xl" />
                <div className="flex flex-wrap gap-2 mt-3">
                  {PROMPTS.map((p) => (
                    <button key={p} onClick={() => setQuestion(p)} className="text-xs text-muted-foreground bg-secondary hover:bg-accent rounded-full px-3 py-1.5 transition-colors">{p}</button>
                  ))}
                </div>
                <Button onClick={start} disabled={!question.trim()} className="w-full mt-4 rounded-full h-11">
                  <Landmark className="w-4 h-4 mr-2" /> Convene the board
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      {phase === "result" && result && (
        <div>
          <div className="flex items-center justify-between mb-6">
            <p className="font-display text-xl max-w-2xl">"{question}"</p>
            <Button variant="outline" className="rounded-full shrink-0" onClick={() => { setPhase("idle"); setQuestion(""); }}>New question</Button>
          </div>
          <MeetingResult result={result} advisors={advisors} onRecordDecision={recordDecision} recording={recording} />
        </div>
      )}
    </div>
  );
}