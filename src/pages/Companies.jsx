import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Plus, Building2, RefreshCw, Shield } from "lucide-react";
import CompanyCard from "@/components/companies/CompanyCard";
import GuidedOnboarding from "@/components/onboarding/GuidedOnboarding";
import EmptyState from "@/components/EmptyState";
import HealthWidget from "@/components/HealthWidget";
import StatsWidget from "@/components/StatsWidget";

export default function Companies() {
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
            <div className="w-16 h-16 rounded-2xl bg-secondary flex items-center justify-center mb-5">
              <RefreshCw className="w-7 h-7 text-muted-foreground" strokeWidth={1.5} />
            </div>
            <h3 className="text-xl font-display mb-2">Connection interrupted</h3>
            <p className="text-muted-foreground max-w-sm mb-6">We couldn't reach the server. Please check your connection and try again.</p>
            <Button onClick={load} className="rounded-full px-6"><RefreshCw className="w-4 h-4 mr-1.5" /> Retry</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-5 sm:px-8 py-12 lg:py-16">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6 mb-12 fade-in">
          <div>
            <div className="text-[2.5rem] sm:text-[3.25rem] sm:leading-[1.08] font-normal font-display mb-3 text-balance">
              {user ? `${(() => {const h = new Date().getHours();return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";})()}, ${user.full_name?.split(" ")[0] || "there"}` : "\u00A0"}
            </div>
            <p className="text-muted-foreground text-base sm:text-lg max-w-md leading-relaxed">Here's your executive briefing. <span className="font-display italic text-foreground/80">Never build alone.</span></p>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            {user?.role === "admin" && <Link to="/admin"><Button variant="ghost" className="rounded-full"><Shield className="w-4 h-4 mr-1.5" /> Admin</Button></Link>}
            <Link to="/pricing"><Button variant="ghost" className="rounded-full">Pricing</Button></Link>
            {companies?.length > 0 &&
            <Button onClick={() => setOnboarding(true)} variant="brand" className="px-6 rounded-full text-[0.95rem]"><Plus className="w-4 h-4 mr-1.5" /> Create Your Next Venture</Button>
            }
          </div>
        </div>

        <StatsWidget decisions={decisions} meetings={meetings} tasks={tasks} />
        <HealthWidget />

        {companies === null ?
        <div className="grid sm:grid-cols-1 lg:grid-cols-2 gap-6">
            {[0, 1, 2, 3].map((i) => <div key={i} className="h-72 rounded-3xl bg-secondary/50 animate-pulse" />)}
          </div> :
        companies.length === 0 ?
        <EmptyState
          icon={Building2}
          title="Establish your first company"
          description="Create a workspace, assemble your AI executive team, and start making better decisions together."
          action={<Button onClick={() => setOnboarding(true)} variant="brand" className="rounded-full px-6"><Plus className="w-4 h-4 mr-1.5" /> Create a company</Button>} /> :


        <div className="grid sm:grid-cols-1 lg:grid-cols-2 gap-6">
            {companies.map((c, i) =>
          <div key={c.id} className="rise-in h-full" style={{ animationDelay: `${i * 60}ms` }}><CompanyCard company={c} stats={stats[c.id] || { advisors: 0, meetings: 0, decisions: 0 }} advisors={stats[c.id]?.advisorList || []} /></div>
          )}
          </div>
        }
      </div>

      <GuidedOnboarding open={onboarding} onClose={() => setOnboarding(false)} />
    </div>);

}