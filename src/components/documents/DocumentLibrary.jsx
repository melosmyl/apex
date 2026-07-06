import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Plus, Trash2, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";

const CATEGORIES = ["Business Plan", "Pitch Deck", "Financials", "Brand Guidelines", "Customer Personas", "Competitor Research", "Marketing", "Contract", "Other"];

export default function DocumentLibrary({ kind, eyebrow, title, description, emptyText }) {
  const { companyId } = useParams();
  const [items, setItems] = useState(null);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(null);
  const [form, setForm] = useState({ title: "", category: "Other", content: "" });

  const load = () => base44.entities.Document.filter({ company_id: companyId, kind }, "-created_date", 200).then(setItems);
  useEffect(() => { load(); }, [companyId, kind]);

  const create = async () => {
    if (!form.title.trim()) return;
    await base44.entities.Document.create({ ...form, company_id: companyId, kind });
    setForm({ title: "", category: "Other", content: "" }); setOpen(false); load();
  };
  const remove = async (d) => { await base44.entities.Document.delete(d.id); setView(null); load(); };

  return (
    <div>
      <PageHeader eyebrow={eyebrow} title={title} description={description}>
        <Button onClick={() => setOpen(true)} className="rounded-full px-5"><Plus className="w-4 h-4 mr-1.5" /> Add</Button>
      </PageHeader>
      {items === null ? <div className="h-40 rounded-2xl bg-secondary/60 animate-pulse" />
        : items.length === 0 ? <EmptyState icon={FileText} title="Nothing here yet" description={emptyText} action={<Button onClick={() => setOpen(true)} className="rounded-full px-6"><Plus className="w-4 h-4 mr-1.5" /> Add</Button>} />
        : (
        <div className="grid sm:grid-cols-2 gap-4">
          {items.map((d) => (
            <div key={d.id} className="group bg-card border border-border/70 rounded-2xl p-5 rise-in cursor-pointer hover:shadow-md transition-all" onClick={() => setView(d)}>
              <div className="flex items-start justify-between gap-2 mb-2">
                <h3 className="font-display text-lg leading-snug">{d.title}</h3>
                <button onClick={(e) => { e.stopPropagation(); remove(d); }} className="text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive transition-all"><Trash2 className="w-4 h-4" /></button>
              </div>
              <Badge variant="secondary" className="rounded-full font-normal mb-2">{d.category}</Badge>
              {d.content && <p className="text-sm text-muted-foreground line-clamp-3">{d.content}</p>}
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle className="font-display text-2xl font-light">Add to library</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div><Label className="mb-1.5 block">Title</Label><Input value={form.title} onChange={(e)=>setForm(f=>({...f,title:e.target.value}))} autoFocus /></div>
            <div><Label className="mb-1.5 block">Category</Label>
              <select value={form.category} onChange={(e)=>setForm(f=>({...f,category:e.target.value}))} className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm">
                {CATEGORIES.map(c=><option key={c}>{c}</option>)}
              </select>
            </div>
            <div><Label className="mb-1.5 block">Content</Label><Textarea value={form.content} onChange={(e)=>setForm(f=>({...f,content:e.target.value}))} rows={6} placeholder="Paste or write the content your advisors should know." /></div>
            <div className="flex justify-end gap-2"><Button variant="ghost" onClick={()=>setOpen(false)}>Cancel</Button><Button onClick={create} disabled={!form.title.trim()}>Save</Button></div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!view} onOpenChange={(o)=>!o&&setView(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          {view && <>
            <DialogHeader><DialogTitle className="font-display text-2xl font-light">{view.title}</DialogTitle></DialogHeader>
            <Badge variant="secondary" className="rounded-full font-normal w-fit">{view.category}</Badge>
            <p className="text-sm leading-relaxed whitespace-pre-wrap mt-3">{view.content || "No content."}</p>
          </>}
        </DialogContent>
      </Dialog>
    </div>
  );
}