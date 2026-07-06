import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { UserPlus, Users, Trash2, Loader2, Mail, RefreshCw } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import AdvisorAvatar from "@/components/AdvisorAvatar";
import AddAdvisorDialog from "@/components/team/AddAdvisorDialog";
import InvitePersonDialog from "@/components/team/InvitePersonDialog";
import AdvisorProfileDialog from "@/components/team/AdvisorProfileDialog";

export default function ExecutiveTeam() {
  const { companyId } = useParams();
  const [advisors, setAdvisors] = useState(null);
  const [subscriptions, setSubscriptions] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [selected, setSelected] = useState(null);

  const load = async () => {
    setLoadError(null);
    try {
      const [advs, subs] = await Promise.all([
      base44.entities.Advisor.filter({ company_id: companyId }, "-created_date", 100),
      base44.entities.Subscription.filter({ company_id: companyId }, "-created_date", 100)]
      );
      setAdvisors(advs);
      setSubscriptions(subs);
    } catch (e) {
      console.error("ExecutiveTeam load failed", e);
      setLoadError(e?.message || "Network Error");
    }
  };
  useEffect(() => {load();}, [companyId]);

  const subFor = (advisorId) => subscriptions.find((s) => s.advisor_id === advisorId);
  const freeAdvisors = (advisors || []).filter((a) => {
    const s = subFor(a.id);
    return !s || s.status === "canceled";
  });
  const requiresPayment = freeAdvisors.length >= 2;

  const addAdvisor = async (lib) => {
    const created = await base44.entities.Advisor.create({
      company_id: companyId, library_key: lib.key, name: lib.name, role: lib.role,
      biography: lib.biography, decision_style: lib.decision_style, communication_style: lib.communication_style,
      strengths: lib.strengths, weaknesses: lib.weaknesses, expertise: lib.expertise,
      personality_traits: lib.personality_traits, accent: lib.accent
    });
    if (requiresPayment) {
      const res = await base44.functions.invoke("create-checkout", {
        company_id: companyId, advisor_id: created.id, advisor_name: lib.name, origin: window.location.origin
      });
      window.location.href = res.data.redirectUrl;
    } else {
      await load();
    }
  };

  const invitePerson = async ({ name, role, email }) => {
    await base44.users.inviteUser(email, "user");
    await base44.entities.Advisor.create({ company_id: companyId, type: "human", name, role, email, biography: "Invited team member." });
    await load();
  };

  const remove = async (advisor) => {
    const sub = subFor(advisor.id);
    if (sub && sub.status === "active" && sub.subscription_id) {
      try {await base44.functions.invoke("cancel-subscription", { subscription_id: sub.subscription_id });} catch (e) {/* ignore */}
    }
    await base44.entities.Advisor.delete(advisor.id);
    setSelected(null);
    load();
  };

  const existingKeys = (advisors || []).map((a) => a.library_key);

  return (
    <div>
      <PageHeader eyebrow="The heart of the platform" title="Executive Team"
      description="Assemble your executive team — add specialist AI advisors or invite real collaborators. Your first two AI advisors are free, then £9/month each.">
        <div className="flex gap-2">
          <Button onClick={() => setAddOpen(true)} className="rounded-full px-5 bg-[#417a24]"><UserPlus className="w-4 h-4 mr-1.5" /> Invite advisor</Button>
          <Button onClick={() => setInviteOpen(true)} variant="outline" className="rounded-full px-5"><Mail className="w-4 h-4 mr-1.5" /> Invite person</Button>
        </div>
      </PageHeader>

      {loadError ?
      <EmptyState icon={RefreshCw} title="Couldn't load your team"
      description={`A network error occurred${loadError ? `: ${loadError}` : ""}. Please check your connection and try again.`}
      action={<Button onClick={load} className="rounded-full px-6"><RefreshCw className="w-4 h-4 mr-1.5" /> Retry</Button>} /> :
      advisors === null ?
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{[0, 1, 2].map((i) => <div key={i} className="h-40 rounded-2xl bg-secondary/60 animate-pulse" />)}</div> :
      advisors.length === 0 ?
      <EmptyState icon={Users} title="Your boardroom is empty"
      description="Invite AI advisors from the library or bring in real collaborators to build your executive team."
      action={<div className="flex gap-2 justify-center"><Button onClick={() => setAddOpen(true)} className="rounded-full px-6"><UserPlus className="w-4 h-4 mr-1.5" /> Invite advisor</Button><Button onClick={() => setInviteOpen(true)} variant="outline" className="rounded-full px-6"><Mail className="w-4 h-4 mr-1.5" /> Invite person</Button></div>} /> :

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {advisors.map((a) => {
          const sub = subFor(a.id);
          const isPending = sub && sub.status === "pending";
          const isActive = sub && sub.status === "active";
          return (
            <div key={a.id} className="group bg-card border border-border/70 rounded-2xl p-5 hover:shadow-lg transition-all rise-in cursor-pointer" onClick={() => setSelected(a)}>
                <div className="flex items-start justify-between mb-3">
                  <AdvisorAvatar name={a.name} accent={a.accent} size="lg" />
                  <button onClick={(e) => {e.stopPropagation();remove(a);}} className="text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive transition-all"><Trash2 className="w-4 h-4" /></button>
                </div>
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-display text-lg">{a.name}</h3>
                  {isPending && <Badge variant="outline" className="text-[10px] font-normal bg-amber-50 text-amber-700 border-amber-200"><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Activating</Badge>}
                  {isActive && <Badge variant="outline" className="text-[10px] font-normal">£9/mo</Badge>}
                  {a.type === "human" && <Badge variant="secondary" className="text-[10px] font-normal">Member</Badge>}
                </div>
                <p className="text-sm text-muted-foreground mb-3">{a.role}</p>
                <p className="text-xs text-muted-foreground line-clamp-2">{a.biography}</p>
              </div>);

        })}
        </div>
      }

      <AddAdvisorDialog open={addOpen} onOpenChange={setAddOpen} existingKeys={existingKeys} onAdd={addAdvisor} requiresPayment={requiresPayment} />
      <InvitePersonDialog open={inviteOpen} onOpenChange={setInviteOpen} onInvite={invitePerson} />
      <AdvisorProfileDialog advisor={selected} open={!!selected} onOpenChange={(o) => !o && setSelected(null)}
      onAction={remove} actionLabel="Remove from team" actionVariant="destructive" />
    </div>);

}