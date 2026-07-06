import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { UserPlus, Users, Trash2 } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import AdvisorAvatar from "@/components/AdvisorAvatar";
import AddAdvisorDialog from "@/components/team/AddAdvisorDialog";
import AdvisorProfileDialog from "@/components/team/AdvisorProfileDialog";

export default function ExecutiveTeam() {
  const { companyId } = useParams();
  const [advisors, setAdvisors] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [selected, setSelected] = useState(null);

  const load = () => base44.entities.Advisor.filter({ company_id: companyId }, "-created_date", 100).then(setAdvisors);
  useEffect(() => { load(); }, [companyId]);

  const addAdvisor = async (lib) => {
    await base44.entities.Advisor.create({
      company_id: companyId, library_key: lib.key, name: lib.name, role: lib.role,
      biography: lib.biography, decision_style: lib.decision_style, communication_style: lib.communication_style,
      strengths: lib.strengths, weaknesses: lib.weaknesses, expertise: lib.expertise,
      personality_traits: lib.personality_traits, accent: lib.accent,
    });
    await load();
  };

  const remove = async (advisor) => {
    await base44.entities.Advisor.delete(advisor.id);
    setSelected(null);
    load();
  };

  const existingKeys = (advisors || []).map((a) => a.library_key);

  return (
    <div>
      <PageHeader eyebrow="The heart of the platform" title="Executive Team"
        description="Assemble a team of specialist AI advisors. Each thinks differently — and will disagree.">
        <Button onClick={() => setAddOpen(true)} className="rounded-full px-5"><UserPlus className="w-4 h-4 mr-1.5" /> Invite advisor</Button>
      </PageHeader>

      {advisors === null ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{[0,1,2].map(i => <div key={i} className="h-40 rounded-2xl bg-secondary/60 animate-pulse" />)}</div>
      ) : advisors.length === 0 ? (
        <EmptyState icon={Users} title="Your boardroom is empty"
          description="Invite advisors from the library to build your executive team."
          action={<Button onClick={() => setAddOpen(true)} className="rounded-full px-6"><UserPlus className="w-4 h-4 mr-1.5" /> Invite your first advisor</Button>} />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {advisors.map((a) => (
            <div key={a.id} className="group bg-card border border-border/70 rounded-2xl p-5 hover:shadow-lg transition-all rise-in cursor-pointer" onClick={() => setSelected(a)}>
              <div className="flex items-start justify-between mb-3">
                <AdvisorAvatar name={a.name} accent={a.accent} size="lg" />
                <button onClick={(e) => { e.stopPropagation(); remove(a); }} className="text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive transition-all"><Trash2 className="w-4 h-4" /></button>
              </div>
              <h3 className="font-display text-lg">{a.name}</h3>
              <p className="text-sm text-muted-foreground mb-3">{a.role}</p>
              <p className="text-xs text-muted-foreground line-clamp-2">{a.biography}</p>
            </div>
          ))}
        </div>
      )}

      <AddAdvisorDialog open={addOpen} onOpenChange={setAddOpen} existingKeys={existingKeys} onAdd={addAdvisor} />
      <AdvisorProfileDialog advisor={selected} open={!!selected} onOpenChange={(o) => !o && setSelected(null)}
        onAction={remove} actionLabel="Remove from team" actionVariant="destructive" />
    </div>
  );
}