import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/use-toast";
import { base44 } from "@/api/base44Client";
import AdvisorAvatar from "@/components/AdvisorAvatar";

// A Draft or Plan an advisor did for the founder ("Do this for me") and the
// founder accepted into Knowledge. Read as what it is: the text, who wrote
// it, when, and the task it came from, with Copy, Edit and Archive. Old
// deliverables keep their own viewer (DocumentDetailDialog).

export const isAdvisorWork = (doc) =>
  !!doc && doc.kind === "knowledge" && !!doc.task_id && ["Draft", "Plan"].includes(doc.category);

const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" });

function Paragraphs({ text }) {
  const parts = String(text || "").split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return <p className="text-muted-foreground">Nothing written yet.</p>;
  return (
    <div className="space-y-4 text-[0.98rem] leading-relaxed">
      {parts.map((p, i) => <p key={i} className="whitespace-pre-wrap">{p}</p>)}
    </div>
  );
}

export default function AdvisorWorkDialog({ doc, advisors = [], onClose, onChanged }) {
  const [current, setCurrent] = useState(doc);
  const [task, setTask] = useState(null);
  const [advisor, setAdvisor] = useState(() => advisors.find((a) => a.id === doc?.created_by_advisor_id) || null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(doc?.content || "");
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (doc?.task_id) base44.entities.Task.get(doc.task_id).then((t) => { if (!cancelled) setTask(t); }).catch(() => {});
    if (doc?.created_by_advisor_id && !advisor) {
      base44.entities.Advisor.get(doc.created_by_advisor_id).then((a) => { if (!cancelled) setAdvisor(a); }).catch(() => {});
    }
    return () => { cancelled = true; };
  }, [doc?.id]);

  if (!current) return null;
  // Archived, or replaced by a newer accepted version: kept for the record,
  // not read by the board, so not edited either.
  const archived = current.status === "archived";
  const replaced = current.status === "superseded";
  const retired = archived || replaced;

  const copy = async () => {
    try { await navigator.clipboard.writeText(current.content || ""); toast({ title: "Copied" }); }
    catch { toast({ title: "Couldn't copy", description: "Select the text and copy it instead." }); }
  };

  const save = async () => {
    setBusy(true);
    try {
      const updated = await base44.entities.Document.update(current.id, { content: draft });
      setCurrent(updated); setEditing(false); onChanged?.(updated);
      toast({ title: "Saved", description: "Your board will read your version." });
    } catch { toast({ title: "Couldn't save that", description: "Please try again." }); }
    finally { setBusy(false); }
  };

  const archive = async () => {
    setBusy(true);
    try {
      const updated = await base44.entities.Document.update(current.id, { status: "archived" });
      setCurrent(updated); setConfirmArchive(false); onChanged?.(updated);
      toast({ title: "Archived", description: "It's out of Knowledge and your board won't read it." });
    } catch { toast({ title: "Couldn't archive that", description: "Please try again." }); }
    finally { setBusy(false); }
  };

  const unsaved = editing && draft !== (current.content || "");
  // Closing with unsaved edits asks first instead of throwing them away.
  const requestClose = () => { if (unsaved) setConfirmLeave(true); else onClose?.(); };

  const companyId = current.company_id;
  const kindWord = current.category === "Plan" ? "Plan" : "Draft";

  return (
    <Dialog open onOpenChange={(o) => { if (!o) requestClose(); }}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader className="pr-8">
          <span className="room-mono">{kindWord}{archived ? " · archived" : replaced ? " · replaced by a newer version" : ""}</span>
          <DialogTitle className="font-display text-2xl font-normal leading-snug">{current.title}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          {(advisor || current.created_by_advisor_id) && (
            <span className="inline-flex items-center gap-1.5">
              <AdvisorAvatar name={advisor?.name} libraryKey={advisor?.library_key} size="xs" />
              {advisor?.name || "Your advisor"}
            </span>
          )}
          {current.created_at && <span>{dateFmt.format(new Date(current.created_at))}</span>}
          {task && companyId && (
            <Link to={`/company/${companyId}/tasks${task.source_meeting_id ? `?meeting=${task.source_meeting_id}` : ""}`} className="underline underline-offset-2" onClick={() => onClose?.()}>
              From the task: {task.title}
            </Link>
          )}
        </div>

        <div className="mt-2 border-t border-border pt-5">
          {editing ? (
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={14}
              autoFocus
              aria-label="Edit the text"
              className="block w-full rounded-md border border-input bg-background p-3 text-[0.95rem] leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          ) : (
            <Paragraphs text={current.content} />
          )}
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-border pt-4">
          {confirmLeave ? (
            <>
              <span role="status" className="text-sm">You have changes that aren't saved.</span>
              <Button size="sm" variant="primary" autoFocus onClick={() => { setConfirmLeave(false); onClose?.(); }}>Discard them</Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmLeave(false)}>Keep editing</Button>
            </>
          ) : editing ? (
            <>
              <Button size="sm" variant="primary" disabled={busy || !unsaved || !draft.trim()} onClick={save}>{busy ? "Saving…" : "Save"}</Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => { setEditing(false); setDraft(current.content || ""); }}>Cancel</Button>
            </>
          ) : confirmArchive ? (
            <>
              <span role="status" className="text-sm">Archive this? It leaves Knowledge and your board stops reading it.</span>
              <Button size="sm" variant="primary" autoFocus disabled={busy} onClick={archive}>{busy ? "Archiving…" : "Archive"}</Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => setConfirmArchive(false)}>Cancel</Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="secondaryOutline" onClick={copy}>Copy</Button>
              {!retired && <Button size="sm" variant="secondaryOutline" onClick={() => { setDraft(current.content || ""); setEditing(true); }}>Edit</Button>}
              {!retired && <Button size="sm" variant="ghost" onClick={() => setConfirmArchive(true)}>Archive</Button>}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
