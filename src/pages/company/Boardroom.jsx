import React, { useEffect, useState } from "react";
import { useParams, useNavigate, useOutletContext } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import ModeSelector from "@/components/boardroom/ModeSelector";
import QuickAsk from "@/components/boardroom/QuickAsk";
import WorkingSession from "@/components/boardroom/WorkingSession";
import BoardDebate from "@/components/boardroom/BoardDebate";
import TaskRequest from "@/components/boardroom/TaskRequest";
import ReviewMode from "@/components/boardroom/ReviewMode";

export default function Boardroom() {
  const { companyId } = useParams();
  const { company } = useOutletContext();
  const navigate = useNavigate();
  const [advisors, setAdvisors] = useState(null);
  const [mode, setMode] = useState(null);
  const [question, setQuestion] = useState("");
  const [loadedMeeting, setLoadedMeeting] = useState(null);

  useEffect(() => {
    base44.entities.Advisor.filter({ company_id: companyId }, "-created_date", 100).then((advs) => {
      setAdvisors(advs);
    });
  }, [companyId]);

  useEffect(() => {
    const meetingId = new URLSearchParams(window.location.search).get("meeting");
    if (!meetingId) return;
    base44.entities.BoardMeeting.get(meetingId).then((m) => {
      if (m) {
        setLoadedMeeting(m);
        setMode(m.meeting_mode || "board_debate");
        setQuestion(m.question || "");
      }
    }).catch(() => {});
  }, [companyId]);

  if (advisors === null) return <div className="h-64 rounded-2xl bg-secondary/60 animate-pulse" />;

  const aiAdvisors = advisors.filter((a) => a.type !== "human");

  if (aiAdvisors.length < 1) {
    return (
      <div>
        <PageHeader eyebrow="The signature experience" title="The Boardroom" />
        <EmptyState
          icon={Users}
          title="Assemble your executive team first"
          description="Add at least one AI advisor to start using the Boardroom."
          action={<Button onClick={() => navigate(`/company/${companyId}/team`)} className="rounded-full px-6">Go to Executive Team</Button>}
        />
      </div>
    );
  }

  const handleSelectMode = (selectedMode, q) => {
    setMode(selectedMode);
    if (q) setQuestion(q);
  };

  const backToModes = () => {
    setMode(null);
    setLoadedMeeting(null);
    setQuestion("");
  };

  return (
    <div>
      <PageHeader
        eyebrow="The signature experience"
        title="The Boardroom"
        description="Choose how you want to work with your advisors — from a quick question to a full board debate."
      />

      {mode ? (
        <div className="rise-in">
          <button
            onClick={backToModes}
            className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1.5 mb-6 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> All modes
          </button>

          {mode === "quick_ask" && (
            <QuickAsk company={company} companyId={companyId} advisors={aiAdvisors} initialQuestion={question} initialMeeting={loadedMeeting} />
          )}
          {mode === "working_session" && (
            <WorkingSession company={company} companyId={companyId} advisors={aiAdvisors} />
          )}
          {mode === "board_debate" && (
            <BoardDebate company={company} companyId={companyId} advisors={advisors} initialQuestion={question} loadedMeeting={loadedMeeting} />
          )}
          {mode === "task_request" && (
            <TaskRequest company={company} companyId={companyId} advisors={aiAdvisors} />
          )}
          {mode === "review" && (
            <ReviewMode company={company} companyId={companyId} advisors={aiAdvisors} />
          )}
        </div>
      ) : (
        <ModeSelector advisors={aiAdvisors} company={company} onSelectMode={handleSelectMode} />
      )}
    </div>
  );
}