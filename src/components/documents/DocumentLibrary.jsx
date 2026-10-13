import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Plus, Trash2, FileText, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/use-toast";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import AdvisorWorkDialog, { isAdvisorWork } from "@/components/documents/AdvisorWorkDialog";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";

const CATEGORIES = ["Business Plan", "Pitch Deck", "Financials", "Brand Guidelines", "Customer Personas", "Competitor Research", "Marketing", "Contract", "Other"];

export default function DocumentLibrary({ kind, eyebrow, title, description, emptyText, allowFiles }) {
  const { companyId } = useParams();
  const [items, setItems] = useState(null);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(null);
  const [form, setForm] = useState({ title: "", category: "Other", content: "", file_url: "", file_name: "" });

  // Archived items leave the library (the board stops reading them too).
  const load = () => base44.entities.Document.filter({ company_id: companyId, kind }, "-created_date", 200)
    .then((docs) => setItems(docs.filter((d) => d.status !== "archived")));
  useEffect(() => { load(); }, [companyId, kind]);

  const create = async () => {
    if (!form.title.trim()) return;
    await base44.entities.Document.create({ ...form, company_id: companyId, kind });
    setForm({ title: "", category: "Other", content: "", file_url: "", file_name: "" }); setOpen(false); load();
  };
  // Deleting can't be undone, so the trash icon asks first, on the card.
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const remove = async (d) => {
    if (deleting) return;
    setDeleting(true);
    try {
      await base44.entities.Document.delete(d.id);
      // An accepted "Do this for me" result: its task stops pointing at it.
      if (isAdvisorWork(d)) await base44.entities.Task.update(d.task_id, { document_id: null }).catch(() => {});
    } catch {
      toast({ title: "Couldn't delete that", description: "Please try again." });
    }
    setDeleting(false); setConfirmDelete(null); setView(null); load();
  };

  return (
    <div>
      <PageHeader eyebrow={eyebrow} title={title} description={description}>
        <Button onClick={() => setOpen(true)} variant="primary" className="px-5"><Plus className="w-4 h-4 mr-1.5" /> Add</Button>
      </PageHeader>
      {items === null ? <div className="h-40 rounded-2xl bg-secondary/60 animate-pulse" />
        : items.length === 0 ? <EmptyState icon={FileText} title="Nothing here yet" description={emptyText} action={<Button onClick={() => setOpen(true)} variant="primary" className="px-6"><Plus className="w-4 h-4 mr-1.5" /> Add</Button>} />
        : (
        <div className="grid sm:grid-cols-2 gap-4">
          {items.map((d) => (
            <div key={d.id} className="group bg-card border border-border/70 rounded-2xl p-5 rise-in cursor-pointer hover:shadow-elevated transition-all" onClick={() => confirmDelete !== d.id && setView(d)}>
              <div className="flex items-start justify-between gap-2 mb-2">
                <h3 className="font-display text-lg leading-snug">{d.title}</h3>
                <button
                  type="button"
                  aria-label={`Delete ${d.title}`}
                  onClick={(e) => { e.stopPropagation(); setConfirmDelete(d.id); }}
                  className="text-muted-foreground transition-all hover:text-destructive focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                ><Trash2 className="w-4 h-4" /></button>
              </div>
              {confirmDelete === d.id && (
                <div
                  className="mb-3 rounded-md border border-border bg-secondary/60 p-3"
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); setConfirmDelete(null); } }}
                >
                  <p id={`delete-note-${d.id}`} className="text-sm">
                    {isAdvisorWork(d) ? "Delete this result? Its task will lose the link, and it can't be undone." : "Delete this? It can't be undone."}
                  </p>
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" variant="primary" autoFocus aria-describedby={`delete-note-${d.id}`} disabled={deleting} onClick={() => remove(d)}>{deleting ? "Deleting…" : "Delete"}</Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(null)}>Cancel</Button>
                  </div>
                </div>
              )}
              <Badge variant="secondary" className="rounded-full font-normal mb-2">{d.category}</Badge>
              {d.content && <p className="text-sm text-muted-foreground line-clamp-3">{d.content}</p>}
              {d.file_url && (
                <div className="flex items-center gap-1.5 mt-3 text-xs text-muted-foreground">
                  <Paperclip className="w-3.5 h-3.5 shrink-0" /> <span className="truncate">{d.file_name || "Attachment"}</span>
                </div>
              )}
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
              <div className="flex flex-wrap gap-1.5">
                {CATEGORIES.map(c => (
                  <button key={c} type="button" onClick={() => setForm(f => ({ ...f, category: c }))}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${form.category === c ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-accent"}`}>
                    {c}
                  </button>
                ))}
              </div>
            </div>
            <div><Label className="mb-1.5 block">Content</Label><Textarea value={form.content} onChange={(e)=>setForm(f=>({...f,content:e.target.value}))} rows={6} placeholder="Paste or write the content your advisors should know." /></div>
            {allowFiles && (
              <div>
                <Label className="mb-1.5 block">Attachment</Label>
                <div className="flex items-center justify-center gap-2 rounded-md border border-dashed border-input bg-secondary/30 px-3 py-4 text-sm text-muted-foreground opacity-60" title="Coming soon — file attachments aren't wired up yet">
                  <Paperclip className="w-4 h-4" /> Attach a file — coming soon
                </div>
              </div>
            )}
            <div className="flex justify-end gap-2"><Button variant="ghost" onClick={()=>setOpen(false)}>Cancel</Button><Button onClick={create} disabled={!form.title.trim()}>Save</Button></div>
          </div>
        </DialogContent>
      </Dialog>

      {view && isAdvisorWork(view) && <AdvisorWorkDialog key={view.id} doc={view} onClose={() => setView(null)} onChanged={load} />}

      <Dialog open={!!view && !isAdvisorWork(view)} onOpenChange={(o)=>!o&&setView(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          {view && <>
            <DialogHeader><DialogTitle className="font-display text-2xl font-light">{view.title}</DialogTitle></DialogHeader>
            <Badge variant="secondary" className="rounded-full font-normal w-fit">{view.category}</Badge>
            <p className="text-sm leading-relaxed whitespace-pre-wrap mt-3">{view.content || "No content."}</p>
            {view.file_url && (
              <a href={view.file_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 mt-4 rounded-md border border-input bg-secondary/40 px-3 py-2 text-sm hover:bg-secondary/70 transition-colors w-fit">
                <Paperclip className="w-4 h-4 text-muted-foreground" /> {view.file_name || "Open attachment"}
              </a>
            )}
          </>}
        </DialogContent>
      </Dialog>
    </div>
  );
}