import React, { useEffect, useState } from "react";
import { useParams, useNavigate, useOutletContext, useLocation } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import BoardroomHome from "@/components/boardroom/BoardroomHome";
import BoardDebate from "@/components/boardroom/BoardDebate";

export default function Boardroom() {
  const { companyId } = useParams();
  const { company } = useOutletContext();
  const navigate = useNavigate();
  const location = useLocation();
  const [advisors, setAdvisors] = useState(null);
  const [mode, setMode] = useState(null);
  const [question, setQuestion] = useState("");
  const [autoStart, setAutoStart] = useState(false);
  const [loadedMeeting, setLoadedMeeting] = useState(null);
  const [routeFromNoteId, setRouteFromNoteId] = useState(null);

  // The Assistant routes a strategic-sized note here via navigate(..., {
  // state }) rather than a URL param — the note's raw text can be long and
  // there's no reason to expose it in the URL. presetNoteId lets BoardDebate
  // report back once a real meeting exists, so the note can be marked routed.
  useEffect(() => {
    const preset = location.state?.presetQuestion;
    if (!preset) return;
    setQuestion(preset);
    setRouteFromNoteId(location.state?.presetNoteId || null);
    setAutoStart(true);
    setMode("board_debate");
    window.history.replaceState({}, "");
  }, [location.state]);

  useEffect(() => {
    base44.entities.Advisor.filter({ company_id: companyId }, "-created_date", 100).then((advs) => {
      setAdvisors(advs);
    });
  }, [companyId]);

  useEffect(() => {
    const meetingId = new URLSearchParams(window.location.search).get("meeting");
    if (!meetingId) return;
    base44.entities.BoardMeeting.get(meetingId).then((m) => {
      // Always routes to BoardDebate — the only mode that can currently
      // produce a meeting to link back to, since the others are disabled.
      // Revisit this once another mode is restored.
      if (m) {
        setLoadedMeeting(m);
        setMode("board_debate");
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

  const startDebate = (q) => {
    setQuestion(q);
    setAutoStart(true);
    setMode("board_debate");
  };

  const backToHome = () => {
    setMode(null);
    setLoadedMeeting(null);
    setQuestion("");
    setAutoStart(false);
    setRouteFromNoteId(null);
  };

  return (
    <div>
      <PageHeader
        eyebrow="The signature experience"
        title="The Boardroom"
        description="Bring a question to your board — they'll debate it and come back with a resolution."
      />

      {mode ? (
        <div className="rise-in">
          <button
            onClick={backToHome}
            className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1.5 mb-6 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Boardroom
          </button>

          <BoardDebate
            company={company}
            companyId={companyId}
            advisors={advisors}
            initialQuestion={question}
            loadedMeeting={loadedMeeting}
            autoStart={autoStart}
            routeFromNoteId={routeFromNoteId}
          />
        </div>
      ) : (
        <BoardroomHome onStartDebate={startDebate} companyId={companyId} />
      )}
    </div>
  );
}
