import React, { useEffect, useState } from "react";
import { useParams, useOutletContext } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Search, Sparkles, Trash2, Upload, Paperclip, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";

const TYPES = ["Competitor Analysis", "Industry Trends", "Customer Behaviour", "Pricing Analysis", "Manufacturing Options", "Investment Research"];

export default function Research() {
  const { companyId } = useParams();
  const { company } = useOutletContext();
  const [items, setItems] = useState(null);
  const [topic, setTopic] = useState("");
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadForm, setUploadForm] = useState({ title: "", file_url: "", file_name: "" });

  const load = () => base44.entities.Document.filter({ company_id: companyId, kind: "research" }, "-created_date", 100).then(setItems);
  useEffect(() => { load(); }, [companyId]);

  const run = async (t) => {
    const query = t || topic;
    if (!query.trim()) return;
    setBusy(true);
    const res = await base44.integrations.Core.InvokeLLM({
      prompt: `Produce a concise, executive-grade research briefing for ${company.name} (industry: ${company.industry || "N/A"}; about: ${company.description || company.tagline || "N/A"}).\n\nResearch request: "${query}".\n\nReturn a well-structured briefing with clear sections, key findings, and implications for this company. Keep it sharp and decision-useful.`,
      add_context_from_internet: true,
      model: "gemini_3_flash",
    });
    await base44.entities.Document.create({ company_id: companyId, kind: "research", title: query, category: "Competitor Research", content: typeof res === "string" ? res : JSON.stringify(res) });
    setTopic(""); setBusy(false); load();
  };

  const remove = async (d) => { await base44.entities.Document.delete(d.id); setView(null); load(); };

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setUploadForm(f => ({ ...f, file_url, file_name: file.name, title: f.title || file.name.replace(/\.[^.]+$/, "") }));
    } finally {
      setUploading(false);
    }
  };

  const saveUpload = async () => {
    if (!uploadForm.title.trim() || !uploadForm.file_url) return;
    await base44.entities.Document.create({ company_id: companyId, kind: "research", title: uploadForm.title, category: "Competitor Research", content: "", file_url: uploadForm.file_url, file_name: uploadForm.file_name });
    setUploadForm({ title: "", file_url: "", file_name: "" }); setUploadOpen(false); load();
  };

  return (
    <div>
      <PageHeader eyebrow="On-demand intelligence" title="Research Hub"
        description="Request research your board can reference in future meetings.">
        <Button onClick={() => setUploadOpen(true)} variant="secondaryOutline" className="px-5"><Upload className="w-4 h-4 mr-1.5" /> Upload</Button>
      </PageHeader>

      <div className="bg-card border border-border/70 rounded-2xl p-6 mb-8 rise-in">
        <div className="flex flex-col sm:flex-row gap-3">
          <Input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="What should we research?" className="rounded-full" disabled={busy} onKeyDown={(e)=>e.key==="Enter"&&run()} />
          <Button onClick={() => run()} disabled={busy || !topic.trim()} variant="primary" className="px-6">
            {busy ? <><Sparkles className="w-4 h-4 mr-2 animate-pulse" /> Researching…</> : <><Search className="w-4 h-4 mr-2" /> Research</>}
          </Button>
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          {TYPES.map((t) => <button key={t} disabled={busy} onClick={() => run(t)} className="text-xs text-muted-foreground bg-secondary hover:bg-accent rounded-full px-3 py-1.5 transition-colors disabled:opacity-50">{t}</button>)}
        </div>
      </div>

      {items === null ? <div className="h-40 rounded-2xl bg-secondary/60 animate-pulse" />
        : items.length === 0 ? <EmptyState icon={Search} title="No research yet" description="Request a briefing above — it's saved for your whole board to reference." />
        : (
        <div className="grid sm:grid-cols-2 gap-4">
          {items.map((d) => (
            <div key={d.id} className="group bg-card border border-border/70 rounded-2xl p-5 rise-in cursor-pointer hover:shadow-md transition-all" onClick={() => setView(d)}>
              <div className="flex items-start justify-between gap-2 mb-2">
                <h3 className="font-display text-lg leading-snug">{d.title}</h3>
                <button onClick={(e) => { e.stopPropagation(); remove(d); }} className="text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive transition-all"><Trash2 className="w-4 h-4" /></button>
              </div>
              <p className="text-sm text-muted-foreground line-clamp-4">{d.content}</p>
              {d.file_url && (
                <div className="flex items-center gap-1.5 mt-3 text-xs text-muted-foreground">
                  <Paperclip className="w-3.5 h-3.5 shrink-0" /> <span className="truncate">{d.file_name || "Attachment"}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!view} onOpenChange={(o)=>!o&&setView(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          {view && <>
            <DialogHeader><DialogTitle className="font-display text-2xl font-light">{view.title}</DialogTitle></DialogHeader>
            <p className="text-sm leading-relaxed whitespace-pre-wrap mt-2">{view.content}</p>
            {view.file_url && (
              <a href={view.file_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 mt-4 rounded-md border border-input bg-secondary/40 px-3 py-2 text-sm hover:bg-secondary/70 transition-colors w-fit">
                <Paperclip className="w-4 h-4 text-muted-foreground" /> {view.file_name || "Open attachment"}
              </a>
            )}
          </>}
        </DialogContent>
      </Dialog>

      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle className="font-display text-2xl font-light">Upload research</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div><Label className="mb-1.5 block">Title</Label><Input value={uploadForm.title} onChange={(e)=>setUploadForm(f=>({...f,title:e.target.value}))} autoFocus /></div>
            <div>
              <Label className="mb-1.5 block">File</Label>
              {uploadForm.file_url ? (
                <div className="flex items-center justify-between gap-2 rounded-md border border-input bg-secondary/40 px-3 py-2">
                  <div className="flex items-center gap-2 min-w-0 text-sm"><Paperclip className="w-4 h-4 shrink-0 text-muted-foreground" /><span className="truncate">{uploadForm.file_name || "Attachment"}</span></div>
                  <button type="button" onClick={()=>setUploadForm(f=>({...f,file_url:"",file_name:""}))} className="text-muted-foreground hover:text-destructive transition-colors"><Trash2 className="w-4 h-4" /></button>
                </div>
              ) : (
                <label className="flex items-center justify-center gap-2 rounded-md border border-dashed border-input bg-secondary/30 px-3 py-4 text-sm text-muted-foreground cursor-pointer hover:bg-secondary/60 transition-colors">
                  {uploading ? <><Loader2 className="w-4 h-4 animate-spin" /> Uploading…</> : <><Paperclip className="w-4 h-4" /> Attach a file</>}
                  <input type="file" onChange={handleFile} className="hidden" disabled={uploading} />
                </label>
              )}
            </div>
            <div className="flex justify-end gap-2"><Button variant="ghost" onClick={()=>setUploadOpen(false)}>Cancel</Button><Button onClick={saveUpload} disabled={!uploadForm.title.trim() || !uploadForm.file_url || uploading}>Save</Button></div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}