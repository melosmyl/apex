import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Plus, RefreshCw, Shield } from "lucide-react";
import CompanyCard from "@/components/companies/CompanyCard";
import GuidedOnboarding from "@/components/onboarding/GuidedOnboarding";
import EmptyState from "@/components/EmptyState";

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return mins <= 1 ? "just now" : `${mins} minutes ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return hours === 1 ? "an hour ago" : `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}

// True statements only — what moved, what's waiting, when the board last
// met. No name, no time-of-day performance. If none of these are true,
// render nothing rather than a greeting standing in for real content.
function headline({ companies, decisionsWaiting, tasksCompletedOvernight, lastMeeting }) {
  if (!companies?.length) return null;
  if (decisionsWaiting > 0) return `${decisionsWaiting} decision${decisionsWaiting === 1 ? "" : "s"} waiting on you.`;
  if (tasksCompletedOvernight > 0) return `${tasksCompletedOvernight} task${tasksCompletedOvernight === 1 ? "" : "s"} moved overnight.`;
  if (lastMeeting?.created_date) return `Your board last met ${timeAgo(lastMeeting.created_date)}.`;
  return null;
}

// skipRedirect: the explicit "/companies" hub always shows the list, even
// for a single-company account — otherwise there'd be no way back to it
// to start a second company once the smart "/" entry point sends you
// straight into your only one.
export default function Companies({ skipRedirect = false }) {
  const navigate = useNavigate();
  const [companies, setCompanies] = useState(null);
  const [stats, setStats] = useState({});
  const [user, setUser] = useState(null);
  const [onboarding, setOnboarding] = useState(false);
  const [error, setError] = useState(false);
  const [meetings, setMeetings] = useState([]);
  const [decisions, setDecisions] = useState([]);
  const [tasks, setTasks] = useState([]);

  const load = async () => {
    setError(false);
    try {
      const [me, list] = await Promise.all([base44.auth.me(), base44.entities.Company.list("-created_date")]);
      setUser(me);
      if (!skipRedirect && list.length === 1) {
        navigate(`/company/${list[0].id}`, { replace: true });
        return;
      }
      setCompanies(list);
      const [advisors, meetings, decisions, tasksList] = await Promise.all([
        base44.entities.Advisor.list("-created_date", 500),
        base44.entities.BoardMeeting.list("-created_date", 500),
        base44.entities.Decision.list("-created_date", 500),
        base44.entities.Task.list("-updated_date", 500)
      ]);
      setMeetings(meetings);
      setDecisions(decisions);
      setTasks(tasksList);
      const s = {};
      list.forEach((c) => {
        const companyAdvisors = advisors.filter((a) => a.company_id === c.id);
        s[c.id] = {
          advisors: companyAdvisors.length,
          advisorList: companyAdvisors,
          meetings: meetings.filter((m) => m.company_id === c.id).length,
          completedMeetings: meetings.filter((m) => m.company_id === c.id && m.status === "complete").length,
          decisions: decisions.filter((d) => d.company_id === c.id).length
        };
      });
      setStats(s);
    } catch (e) {
      console.error("Companies load failed:", e);
      setError(true);
    }
  };

  useEffect(() => {load();}, []);

  if (error) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 py-12 lg:py-16">
          <div className="flex flex-col items-center justify-center text-center py-20 rise-in">
            <h3 className="text-xl font-display mb-2">Connection interrupted</h3>
            <p className="text-muted-foreground max-w-sm mb-6">We couldn't reach the server. Please check your connection and try again.</p>
            <Button onClick={load} variant="primary" className="px-6"><RefreshCw className="w-4 h-4 mr-1.5" /> Retry</Button>
          </div>
        </div>
      </div>
    );
  }

  const decisionsWaiting = decisions.filter((d) => d.status === "pending").length;
  const overnightCutoff = Date.now() - 12 * 60 * 60 * 1000;
  const tasksCompletedOvernight = tasks.filter(
    (t) => t.status === "done" && t.updated_date && new Date(t.updated_date).getTime() >= overnightCutoff
  ).length;
  const headlineText = user ? headline({ companies, decisionsWaiting, tasksCompletedOvernight, lastMeeting: meetings[0] }) : null;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-5 sm:px-8 py-12 lg:py-16">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6 mb-12 fade-in">
          <div>
            {headlineText && (
              <div className="text-[2.5rem] sm:text-[3.25rem] sm:leading-[1.08] font-normal font-display mb-3 text-balance">
                {headlineText}
              </div>
            )}
            <p className="text-muted-foreground text-base sm:text-lg max-w-md leading-relaxed">Here are your companies. <span className="font-display italic text-foreground/80">Never build alone.</span></p>
          </div>
          {/* Pure navigation now — the create action lives in the company
              list itself (a tile at the end), not paired up here as though
              the two were related. */}
          <div className="flex flex-wrap gap-2 items-center">
            {user?.role === "admin" && <Link to="/admin"><Button variant="ghost"><Shield className="w-4 h-4 mr-1.5" /> Admin</Button></Link>}
            <Link to="/pricing"><Button variant="ghost">Pricing</Button></Link>
          </div>
        </div>

        {companies === null ?
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-6">
            {[0, 1, 2].map((i) => <div key={i} className="h-72 rounded-3xl bg-secondary/50 animate-pulse" />)}
          </div> :
        companies.length === 0 ?
        <EmptyState
          title="Establish your first company"
          description="Create a workspace, assemble your AI executive team, and start making better decisions together."
          action={<Button onClick={() => setOnboarding(true)} variant="primary" className="px-6"><Plus className="w-4 h-4 mr-1.5" /> Create a company</Button>} /> :

        // This is the page — full-width, sized for the realistic 2-4
        // company range, cards carrying real substance rather than a
        // corner of a dashboard. The create tile sits at the end of the
        // same list rather than floating in the header.
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-6">
            {companies.map((c, i) =>
          <div key={c.id} className="rise-in h-full" style={{ animationDelay: `${i * 60}ms` }}><CompanyCard company={c} stats={stats[c.id] || { advisors: 0, meetings: 0, decisions: 0, completedMeetings: 0 }} advisors={stats[c.id]?.advisorList || []} /></div>
          )}
            <button
            onClick={() => setOnboarding(true)}
            className="group w-full text-left border border-dashed border-border rounded-3xl p-6 sm:p-7 min-h-[180px] flex flex-col items-center justify-center gap-3 text-center hover:border-foreground/40 hover:bg-secondary/30 transition-all duration-300 rise-in"
            style={{ animationDelay: `${companies.length * 60}ms` }}
          >
              <div className="w-11 h-11 rounded-full border border-border flex items-center justify-center group-hover:border-foreground/40 transition-colors">
                <Plus className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
              </div>
              <div>
                <div className="font-display text-lg">Create your next venture</div>
                <p className="text-sm text-muted-foreground mt-0.5">A new workspace, a new executive team</p>
              </div>
            </button>
          </div>
        }
      </div>

      <GuidedOnboarding open={onboarding} onClose={() => setOnboarding(false)} />
    </div>);

}