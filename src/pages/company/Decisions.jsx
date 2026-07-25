import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Scale, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import PinnableText from "@/components/pins/PinnableText";
import { usePin } from "@/components/pins/PinContext";
import { format } from "date-fns";

const STATUS = { pending: "bg-amber-50 text-amber-800 border-amber-200", decided: "bg-emerald-50 text-emerald-800 border-emerald-200", reviewed: "bg-stone-100 text-stone-700 border-stone-200" };

export default function Decisions() {
  const { companyId } = useParams();
  const { createPin } = usePin();
  const [items, setItems] = useState(null);
  const [open, setOpen] = useState(null);
  const [form, setForm] = useState({ decision_taken: "", reasoning: "", outcome_review: "", status: "pending" });

  const load = () => base44.entities.Decision.filter({ company_id: companyId }, "-created_date", 100).then(setItems);
  useEffect(() => { load(); }, [companyId]);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("id");
    if (id && items) { const d = items.find((x) => x.id === id); if (d) openDecision(d); }
  }, [items]);

  const openDecision = (d) => { setForm({ decision_taken: d.decision_taken || "", reasoning: d.reasoning || "", outcome_review: d.outcome_review || "", status: d.status || "pending" }); setOpen(d); };

  const save = async () => {
    await base44.entities.Decision.update(open.id, form);
    setOpen(null); load();
  };

  return (
    <div>
      <PageHeader eyebrow="The strategic memory of the company" title="Decision Centre"
        description="Every major decision, recorded — so you can revisit and evaluate it later." />
      {items === null ? <div className="h-40 rounded-2xl bg-secondary/60 animate-pulse" />
        : items.length === 0 ? <EmptyState icon={Scale} title="No decisions yet" description="Convene the board and record its recommendation to build your decision memory." />
        : (
        <div className="space-y-3">
          {items.map((d) => (
            <button key={d.id} onClick={() => openDecision(d)} className="w-full text-left bg-card border border-border/70 rounded-2xl p-5 hover:shadow-md transition-all rise-in">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h3 className="font-display text-lg leading-snug">{d.question}</h3>
                  <p className="text-sm text-muted-foreground mt-1 line-clamp-1">{d.decision_taken || d.final_recommendation}</p>
                </div>
                <Badge variant="outline" className={`capitalize shrink-0 ${STATUS[d.status]}`}>{d.status}</Badge>
              </div>
              <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                <span>{d.created_date ? format(new Date(d.created_date), "d MMM yyyy") : ""}</span>
                {d.confidence_level != null && <span>{Math.round(d.confidence_level)}% confidence</span>}
                <span>{d.participants?.length || 0} participants</span>
              </div>
            </button>
          ))}
        </div>
      )}

      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          {open && <>
            <DialogHeader><DialogTitle className="font-display text-xl font-light leading-snug">{open.question}</DialogTitle></DialogHeader>
            <div className="space-y-4 pt-2">
              <PinnableText companyId={companyId} sourceType="decision_memo" sourceId={open.id} sourceTitle={open.question} sourceUrl={`/company/${companyId}/decisions?id=${open.id}`} decisionId={open.id} onPin={createPin}>
                {open.summary && <div><Label className="text-muted-foreground text-xs uppercase tracking-wider">Board Summary</Label><p className="text-sm mt-1">{open.summary}</p></div>}
                {open.final_recommendation && <div className="bg-accent/50 rounded-xl p-4"><Label className="text-muted-foreground text-xs uppercase tracking-wider">Recommendation</Label><p className="text-sm mt-1">{open.final_recommendation}</p></div>}
                {open.risks?.length > 0 && <div><Label className="text-muted-foreground text-xs uppercase tracking-wider flex items-center gap-1"><ShieldAlert className="w-3.5 h-3.5" /> Risks</Label><ul className="text-sm mt-1 space-y-1">{open.risks.map((r,i)=><li key={i}>— {r}</li>)}</ul></div>}
              </PinnableText>
              <div className="border-t border-border/60 pt-4 space-y-3">
                <div><Label className="mb-1.5 block">Decision taken</Label><Textarea value={form.decision_taken} onChange={(e)=>setForm(f=>({...f,decision_taken:e.target.value}))} rows={2} placeholder="What did you decide?" /></div>
                <div><Label className="mb-1.5 block">Reasoning</Label><Textarea value={form.reasoning} onChange={(e)=>setForm(f=>({...f,reasoning:e.target.value}))} rows={2} /></div>
                <div><Label className="mb-1.5 block">Outcome review <span className="text-muted-foreground font-normal">(revisit later)</span></Label><Textarea value={form.outcome_review} onChange={(e)=>setForm(f=>({...f,outcome_review:e.target.value}))} rows={2} placeholder="Six months on — was it the right call?" /></div>
                <div><Label className="mb-1.5 block">Status</Label>
                  <select value={form.status} onChange={(e)=>setForm(f=>({...f,status:e.target.value}))} className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm">
                    <option value="pending">Pending</option><option value="decided">Decided</option><option value="reviewed">Reviewed</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-1"><Button variant="ghost" onClick={()=>setOpen(null)}>Close</Button><Button onClick={save}>Save decision</Button></div>
            </div>
          </>}
        </DialogContent>
      </Dialog>
    </div>
  );
}