import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Search, Trash2, Upload, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";

const TYPES = ["Competitor Analysis", "Industry Trends", "Customer Behaviour", "Pricing Analysis", "Manufacturing Options", "Investment Research"];

export default function Research() {
  const { companyId } = useParams();
  const [items, setItems] = useState(null);
  const [topic, setTopic] = useState("");
  const [view, setView] = useState(null);

  const load = () => base44.entities.Document.filter({ company_id: companyId, kind: "research" }, "-created_date", 100).then(setItems);
  useEffect(() => { load(); }, [companyId]);

  const remove = async (d) => { await base44.entities.Document.delete(d.id); setView(null); load(); };

  return (
    <div>
      <PageHeader eyebrow="On-demand intelligence" title="Research Hub"
        description="Request research your board can reference in future meetings.">
        <Button variant="secondaryOutline" className="px-5" disabled title="Coming soon — uploading isn't wired up yet"><Upload className="w-4 h-4 mr-1.5" /> Upload</Button>
      </PageHeader>

      {/* Requesting research isn't wired to a real backend yet — disabled
          rather than left looking live, so it reads as unfinished, not
          broken. See DocumentManager/DocumentLibrary/Pins for the same
          treatment on the other base44.integrations.Core.* call sites. */}
      <div className="bg-card border border-border/70 rounded-2xl p-6 mb-8 rise-in opacity-60" title="Coming soon">
        <div className="flex flex-col sm:flex-row gap-3">
          <Input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="What should we research?" className="rounded-full" disabled />
          <Button disabled variant="primary" className="px-6"><Search className="w-4 h-4 mr-2" /> Research</Button>
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          {TYPES.map((t) => <button key={t} disabled className="text-xs text-muted-foreground bg-secondary rounded-full px-3 py-1.5 opacity-50">{t}</button>)}
        </div>
        <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mt-3">Coming soon</p>
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
    </div>
  );
}