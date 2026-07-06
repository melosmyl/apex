import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Plus, Building2 } from "lucide-react";
import CompanyCard from "@/components/companies/CompanyCard";
import CreateCompanyDialog from "@/components/companies/CreateCompanyDialog";
import EmptyState from "@/components/EmptyState";

export default function Companies() {
  const [companies, setCompanies] = useState(null);
  const [stats, setStats] = useState({});
  const [user, setUser] = useState(null);
  const [dialog, setDialog] = useState(false);

  const load = async () => {
    const [me, list] = await Promise.all([base44.auth.me(), base44.entities.Company.list("-created_date")]);
    setUser(me);
    setCompanies(list);
    const [advisors, meetings, decisions] = await Promise.all([
    base44.entities.Advisor.list("-created_date", 500),
    base44.entities.BoardMeeting.list("-created_date", 500),
    base44.entities.Decision.list("-created_date", 500)]
    );
    const s = {};
    list.forEach((c) => {
      s[c.id] = {
        advisors: advisors.filter((a) => a.company_id === c.id).length,
        meetings: meetings.filter((m) => m.company_id === c.id).length,
        decisions: decisions.filter((d) => d.company_id === c.id).length
      };
    });
    setStats(s);
  };

  useEffect(() => {load();}, []);

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-5 sm:px-8 py-12 lg:py-16">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-5 mb-10 fade-in">
          <div>
            <div className="text-xs uppercase tracking-[0.25em] text-muted-foreground mb-3">
              {user ? `${(() => {const h = new Date().getHours();return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";})()}, ${user.full_name?.split(" ")[0] || "there"}` : "\u00A0"}
            </div>
            <h1 className="text-4xl sm:text-5xl font-light">Create Your Next Venture</h1>
            <p className="text-muted-foreground mt-3 font-display italic text-lg">Never build alone.</p>
          </div>
          <div className="flex gap-2 items-center">
            <Link to="/pricing"><Button variant="ghost" className="rounded-full">Pricing</Button></Link>
            {companies?.length > 0 &&
            <Button onClick={() => setDialog(true)} className="px-5 rounded-full"><Plus className="w-4 h-4 mr-1.5" /> New company</Button>
            }
          </div>
        </div>

        {companies === null ?
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[0, 1, 2].map((i) => <div key={i} className="h-56 rounded-2xl bg-secondary/60 animate-pulse" />)}
          </div> :
        companies.length === 0 ?
        <EmptyState
          icon={Building2}
          title="Establish your first company"
          description="Create a workspace, assemble your AI executive team, and start making better decisions together."
          action={<Button onClick={() => setDialog(true)} className="rounded-full px-6"><Plus className="w-4 h-4 mr-1.5" /> Create a company</Button>} /> :


        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {companies.map((c) =>
          <div key={c.id} className="rise-in h-full"><CompanyCard company={c} stats={stats[c.id] || { advisors: 0, meetings: 0, decisions: 0 }} /></div>
          )}
          </div>
        }
      </div>

      <CreateCompanyDialog open={dialog} onOpenChange={setDialog} onCreated={load} />
    </div>);

}