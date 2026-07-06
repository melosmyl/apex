import React, { useEffect, useState } from "react";
import { useParams, useOutletContext } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Search, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

  return (
    <div>
      <PageHeader eyebrow="On-demand intelligence" title="Research Hub"
        description="Request research your board can reference in future meetings." />

      <div className="bg-card border border-border/70 rounded-2xl p-6 mb-8 rise-in">
        <div className="flex flex-col sm:flex-row gap-3">
          <Input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="What should we research?" className="rounded-full" disabled={busy} onKeyDown={(e)=>e.key==="Enter"&&run()} />
          <Button onClick={() => run()} disabled={busy || !topic.trim()} className="rounded-full px-6">
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
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!view} onOpenChange={(o)=>!o&&setView(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          {view && <>
            <DialogHeader><DialogTitle className="font-display text-2xl font-light">{view.title}</DialogTitle></DialogHeader>
            <p className="text-sm leading-relaxed whitespace-pre-wrap mt-2">{view.content}</p>
          </>}
        </DialogContent>
      </Dialog>
    </div>
  );
}