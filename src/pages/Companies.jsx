import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Plus, Building2, RefreshCw, Shield } from "lucide-react";
import CompanyCard from "@/components/companies/CompanyCard";
import CreateCompanyDialog from "@/components/companies/CreateCompanyDialog";
import EmptyState from "@/components/EmptyState";
import HealthWidget from "@/components/HealthWidget";
import StatsWidget from "@/components/StatsWidget";

export default function Companies() {
  const [companies, setCompanies] = useState(null);
  const [stats, setStats] = useState({});
  const [user, setUser] = useState(null);
  const [dialog, setDialog] = useState(false);
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
        <div className="max-w-5xl mx-auto px-6 sm:px-10 py-14 lg:py-20">
          <div className="flex flex-col items-center justify-center text-center py-24 rise-in">
            <div className="w-16 h-16 rounded-2xl bg-secondary/70 flex items-center justify-center mb-6">
              <RefreshCw className="w-6 h-6 text-muted-foreground" strokeWidth={1.25} />
            </div>
            <h3 className="text-2xl font-display font-light mb-2">Connection interrupted</h3>
            <p className="text-muted-foreground max-w-sm mb-8 leading-relaxed">We couldn't reach the server. Please check your connection and try again.</p>
            <Button onClick={load} className="px-6"><RefreshCw className="w-4 h-4 mr-1.5" /> Retry</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-6 sm:px-10 py-14 lg:py-20">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6 mb-12 fade-in">
          <div>
            <div className="text-4xl sm:text-5xl font-light font-display mb-3 leading-tight">
              {user ? `${(() => {const h = new Date().getHours();return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";})()}, ${user.full_name?.split(" ")[0] || "there"}` : "\u00A0"}
            </div>
            <h1 className="text-[11px] uppercase tracking-editorial text-muted-foreground font-body font-medium">Here's your Executive Briefing.</h1>
            <p className="text-muted-foreground mt-4 font-display italic text-lg">Never build alone.</p>
          </div>
          <div className="flex gap-2 items-center">
            {user?.role === "admin" && <Link to="/admin"><Button variant="ghost" className="rounded-full"><Shield className="w-4 h-4 mr-1.5" /> Admin</Button></Link>}
            <Link to="/pricing"><Button variant="ghost" className="rounded-full">Pricing</Button></Link>
            {companies?.length > 0 &&
            <Button onClick={() => setDialog(true)} className="px-6"><Plus className="w-4 h-4 mr-1.5" /> Create Your Next Venture</Button>
            }
          </div>
        </div>

        <StatsWidget decisions={decisions} meetings={meetings} tasks={tasks} />
        <HealthWidget />

        {companies === null ?
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[0, 1, 2].map((i) => <div key={i} className="h-56 rounded-[var(--radius)] bg-secondary/40 animate-pulse" />)}
          </div> :
        companies.length === 0 ?
        <EmptyState
          icon={Building2}
          title="Establish your first company"
          description="Create a workspace, assemble your AI executive team, and start making better decisions together."
          action={<Button onClick={() => setDialog(true)} className="rounded-full px-6"><Plus className="w-4 h-4 mr-1.5" /> Create a company</Button>} /> :


        <div className="grid sm:grid-cols-1 lg:grid-cols-2 gap-6">
            {companies.map((c) =>
          <div key={c.id} className="rise-in h-full"><CompanyCard company={c} stats={stats[c.id] || { advisors: 0, meetings: 0, decisions: 0 }} advisors={stats[c.id]?.advisorList || []} /></div>
          )}
          </div>
        }
      </div>

      <CreateCompanyDialog open={dialog} onOpenChange={setDialog} onCreated={load} />
    </div>);

}