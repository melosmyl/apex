import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { FolderKanban, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";

const STATUS = { planning: "bg-stone-100 text-stone-700", active: "bg-emerald-50 text-emerald-800", on_hold: "bg-amber-50 text-amber-800", completed: "bg-blue-50 text-blue-800" };

export default function Projects() {
  const { companyId } = useParams();
  const [items, setItems] = useState(null);
  const [advisors, setAdvisors] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", timeline: "", executive_owner: "", status: "planning" });

  const load = () => base44.entities.Project.filter({ company_id: companyId }, "-created_date", 100).then(setItems);
  useEffect(() => { load(); base44.entities.Advisor.filter({ company_id: companyId }, "-created_date", 100).then(setAdvisors); }, [companyId]);

  const create = async () => {
    if (!form.name.trim()) return;
    await base44.entities.Project.create({ ...form, company_id: companyId, objectives: [] });
    setForm({ name: "", description: "", timeline: "", executive_owner: "", status: "planning" });
    setOpen(false); load();
  };

  return (
    <div>
      <PageHeader eyebrow="Plan & execute" title="Projects" description="Turn board decisions into structured, owned work.">
        <Button onClick={() => setOpen(true)} className="rounded-full px-5"><Plus className="w-4 h-4 mr-1.5" /> New project</Button>
      </PageHeader>
      {items === null ? <div className="h-40 rounded-2xl bg-secondary/60 animate-pulse" />
        : items.length === 0 ? <EmptyState icon={FolderKanban} title="No projects yet" description="Create a project to organise objectives, owners and timelines." action={<Button onClick={() => setOpen(true)} className="rounded-full px-6"><Plus className="w-4 h-4 mr-1.5" /> New project</Button>} />
        : (
        <div className="grid sm:grid-cols-2 gap-4">
          {items.map((p) => (
            <div key={p.id} className="bg-card border border-border/70 rounded-2xl p-5 rise-in">
              <div className="flex items-start justify-between gap-3 mb-2">
                <h3 className="font-display text-lg">{p.name}</h3>
                <Badge variant="secondary" className={`capitalize shrink-0 ${STATUS[p.status]}`}>{p.status.replace("_", " ")}</Badge>
              </div>
              {p.description && <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{p.description}</p>}
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{p.executive_owner || "Unassigned"}</span><span>{p.timeline}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle className="font-display text-2xl font-light">New project</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div><Label className="mb-1.5 block">Name</Label><Input value={form.name} onChange={(e)=>setForm(f=>({...f,name:e.target.value}))} autoFocus /></div>
            <div><Label className="mb-1.5 block">Description</Label><Textarea value={form.description} onChange={(e)=>setForm(f=>({...f,description:e.target.value}))} rows={3} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="mb-1.5 block">Timeline</Label><Input value={form.timeline} onChange={(e)=>setForm(f=>({...f,timeline:e.target.value}))} placeholder="e.g. Q3 2026" /></div>
              <div><Label className="mb-1.5 block">Executive owner</Label>
                <select value={form.executive_owner} onChange={(e)=>setForm(f=>({...f,executive_owner:e.target.value}))} className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm">
                  <option value="">Unassigned</option>{advisors.map(a=><option key={a.id}>{a.name}</option>)}
                </select>
              </div>
            </div>
            <div><Label className="mb-1.5 block">Status</Label>
              <select value={form.status} onChange={(e)=>setForm(f=>({...f,status:e.target.value}))} className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm">
                <option value="planning">Planning</option><option value="active">Active</option><option value="on_hold">On hold</option><option value="completed">Completed</option>
              </select>
            </div>
            <div className="flex justify-end gap-2"><Button variant="ghost" onClick={()=>setOpen(false)}>Cancel</Button><Button onClick={create} disabled={!form.name.trim()}>Create</Button></div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}