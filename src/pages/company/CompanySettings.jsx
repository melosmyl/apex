import React, { useState } from "react";
import { useOutletContext, useNavigate, useParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Plus, X, Trash2 } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import MetricsEditor from "@/components/company/MetricsEditor";

export default function CompanySettings() {
  const { company, setCompany } = useOutletContext();
  const { companyId } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: company.name || "", industry: company.industry || "", tagline: company.tagline || "",
    description: company.description || "", priorities: company.priorities || [], metrics: company.metrics || [],
  });
  const [newPriority, setNewPriority] = useState("");
  const [saved, setSaved] = useState(false);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    const updated = await base44.entities.Company.update(companyId, form);
    setCompany(updated); setSaved(true); setTimeout(() => setSaved(false), 2000);
  };

  const remove = async () => {
    if (!confirm("Delete this company and its workspace? This cannot be undone.")) return;
    await base44.entities.Company.delete(companyId);
    navigate("/");
  };

  return (
    <div className="max-w-2xl">
      <PageHeader eyebrow="Company" title="Settings" description="Manage your company profile and strategic priorities." />

      <div className="space-y-5 bg-card border border-border/70 rounded-2xl p-6">
        <div><Label className="mb-1.5 block">Company name</Label><Input value={form.name} onChange={(e)=>set("name",e.target.value)} /></div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div><Label className="mb-1.5 block">Industry</Label><Input value={form.industry} onChange={(e)=>set("industry",e.target.value)} /></div>
          <div><Label className="mb-1.5 block">Tagline</Label><Input value={form.tagline} onChange={(e)=>set("tagline",e.target.value)} /></div>
        </div>
        <div><Label className="mb-1.5 block">Context for advisors</Label><Textarea value={form.description} onChange={(e)=>set("description",e.target.value)} rows={4} /></div>

        <div>
          <Label className="mb-1.5 block">Strategic priorities</Label>
          <div className="space-y-2 mb-2">
            {form.priorities.map((p, i) => (
              <div key={i} className="flex items-center gap-2 bg-secondary/60 rounded-lg px-3 py-2">
                <span className="text-sm flex-1">{p}</span>
                <button onClick={() => set("priorities", form.priorities.filter((_, j) => j !== i))}><X className="w-4 h-4 text-muted-foreground hover:text-destructive" /></button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Input value={newPriority} onChange={(e)=>setNewPriority(e.target.value)} placeholder="Add a priority…" onKeyDown={(e)=>{if(e.key==="Enter"&&newPriority.trim()){set("priorities",[...form.priorities,newPriority.trim()]);setNewPriority("");}}} />
            <Button variant="outline" onClick={()=>{if(newPriority.trim()){set("priorities",[...form.priorities,newPriority.trim()]);setNewPriority("");}}}><Plus className="w-4 h-4" /></Button>
          </div>
        </div>

        <MetricsEditor metrics={form.metrics} onChange={(m) => set("metrics", m)} />

        <div className="flex items-center justify-between pt-2">
          <Button onClick={save}>{saved ? "Saved" : "Save changes"}</Button>
        </div>
      </div>

      <div className="mt-6 border border-destructive/30 rounded-2xl p-6">
        <h3 className="font-display text-lg mb-1">Danger zone</h3>
        <p className="text-sm text-muted-foreground mb-4">Permanently delete this company and its workspace.</p>
        <Button variant="destructive" onClick={remove}><Trash2 className="w-4 h-4 mr-1.5" /> Delete company</Button>
      </div>
    </div>
  );
}