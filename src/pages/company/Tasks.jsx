import React, { useEffect, useState } from "react";
import { useParams, useOutletContext } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { CheckSquare, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import TaskCard from "@/components/tasks/TaskCard";
import DocumentDetailDialog from "@/components/documents/DocumentDetailDialog";
import { executeTask } from "@/lib/taskExecution";
import { generateDocumentName, getFolderForType, formatDeliverableContent, DOCUMENT_TYPES } from "@/lib/documents";

const COLUMNS = [
  { key: "todo", label: "To Do" },
  { key: "in_progress", label: "In Progress" },
  { key: "review", label: "Review" },
  { key: "done", label: "Done" },
];

export default function Tasks() {
  const { companyId } = useParams();
  const { company } = useOutletContext();
  const [items, setItems] = useState(null);
  const [advisors, setAdvisors] = useState([]);
  const [projects, setProjects] = useState([]);
  const [open, setOpen] = useState(false);
  const [executingId, setExecutingId] = useState(null);
  const [viewDoc, setViewDoc] = useState(null);
  const [form, setForm] = useState({ title: "", assigned_to: "", project_id: "" });

  const load = () => base44.entities.Task.filter({ company_id: companyId }, "-created_date", 200).then(setItems);
  useEffect(() => { load(); base44.entities.Advisor.filter({ company_id: companyId }, "-created_date", 100).then(setAdvisors); base44.entities.Project.filter({ company_id: companyId }, "-created_date", 100).then(setProjects); }, [companyId]);

  const create = async () => {
    if (!form.title.trim()) return;
    await base44.entities.Task.create({ company_id: companyId, title: form.title, assigned_to: form.assigned_to, project_id: form.project_id || undefined, created_by: "Founder", status: "todo" });
    setForm({ title: "", assigned_to: "", project_id: "" }); setOpen(false); load();
  };

  const move = async (task, dir) => {
    const idx = COLUMNS.findIndex((c) => c.key === task.status);
    const next = dir === "forward" ? COLUMNS[idx + 1]?.key : COLUMNS[idx - 1]?.key;
    if (!next) return;
    await base44.entities.Task.update(task.id, { status: next }); load();
  };

  const execute = async (task) => {
    const advisor = advisors.find((a) => a.name === task.assigned_to);
    if (!advisor) return;
    setExecutingId(task.id);
    await base44.entities.Task.update(task.id, { status: "in_progress", delegated_back: false });
    load();
    try {
      // Gather relevant context for the advisor
      const [knowledgeDocs, decisions] = await Promise.all([
        base44.entities.Document.filter({ company_id: companyId, kind: "knowledge" }, "-created_date", 5),
        base44.entities.Decision.filter({ company_id: companyId }, "-created_date", 3),
      ]);
      const context = [
        knowledgeDocs.length ? "Company knowledge:\n" + knowledgeDocs.map(d => `- ${d.title}: ${(d.content || "").slice(0, 300)}`).join("\n") : "",
        decisions.length ? "Recent decisions:\n" + decisions.map(d => `- ${d.question}: ${d.final_recommendation || d.summary || ""}`).join("\n") : "",
      ].filter(Boolean).join("\n\n");

      const res = await executeTask({ advisor, task, company, context });
      if (res.outcome === "completed" && res.document_type) {
        // Create a structured document deliverable
        const docTitle = generateDocumentName(company.name, res.document_type, res.topic);
        const folder = getFolderForType(res.document_type);
        const content = formatDeliverableContent(res);
        const tags = res.topic ? [res.topic] : [];
        const doc = await base44.entities.Document.create({
          company_id: companyId,
          project_id: task.project_id || undefined,
          task_id: task.id,
          created_by_advisor_id: advisor.id,
          title: docTitle,
          description: res.executive_summary || "",
          document_type: res.document_type,
          folder_path: folder,
          tags,
          status: "ready_for_review",
          approval_status: "pending",
          content_format: "Markdown",
          content,
          source_references: res.source_references || [],
          version_number: 1,
          is_latest_version: true,
          kind: "document",
        });
        // Log generation
        await base44.entities.DeliverableGenerationLog.create({
          company_id: companyId,
          task_id: task.id,
          advisor_id: advisor.id,
          document_id: doc.id,
          document_type: res.document_type,
          provider: "automatic",
          model: "automatic",
          status: "success",
        });
        await base44.entities.Task.update(task.id, {
          status: "review",
          deliverable: res.executive_summary || res.topic || "Deliverable ready for review",
          document_id: doc.id,
          delegated_back: false,
        });
      } else if (res.outcome === "delegated") {
        await base44.entities.Task.update(task.id, { delegated_back: true, blocker: res.blocker, assigned_to: "Founder", status: "todo" });
      } else {
        // Fallback: legacy string deliverable
        await base44.entities.Task.update(task.id, { status: "review", deliverable: typeof res === "string" ? res : "Deliverable ready", delegated_back: false });
      }
      load();
    } finally {
      setExecutingId(null);
    }
  };

  const completeForFounder = async (task) => {
    await base44.entities.Task.update(task.id, { status: "done" }); load();
  };

  return (
    <div>
      <PageHeader eyebrow="Owned work" title="Tasks" description="Assigned by you or generated by your advisors from the boardroom.">
        <Button onClick={() => setOpen(true)} className="rounded-full px-5"><Plus className="w-4 h-4 mr-1.5" /> New task</Button>
      </PageHeader>
      {items === null ? <div className="h-40 rounded-2xl bg-secondary/60 animate-pulse" />
        : items.length === 0 ? <EmptyState icon={CheckSquare} title="No tasks yet" description="Create a task, or let your board assign work during a meeting." action={<Button onClick={() => setOpen(true)} className="rounded-full px-6"><Plus className="w-4 h-4 mr-1.5" /> New task</Button>} />
        : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {COLUMNS.map((col) => {
            const colItems = items.filter((t) => t.status === col.key);
            return (
              <div key={col.key} className="bg-secondary/40 rounded-2xl p-3">
                <div className="flex items-center justify-between px-2 mb-3">
                  <span className="text-sm font-medium">{col.label}</span>
                  <span className="text-xs text-muted-foreground">{colItems.length}</span>
                </div>
                <div className="space-y-2 min-h-[40px]">
                  {colItems.map((t) => (
                    <TaskCard
                      key={t.id}
                      task={t}
                      advisors={advisors}
                      executing={executingId === t.id}
                      onExecute={execute}
                      onCompleteFounder={completeForFounder}
                      onMove={move}
                      onOpenDocument={async (docId) => {
                        const d = await base44.entities.Document.get(docId);
                        setViewDoc(d);
                      }}
                      canBack={COLUMNS.findIndex((c) => c.key === col.key) > 0}
                      canForward={COLUMNS.findIndex((c) => c.key === col.key) < COLUMNS.length - 1}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle className="font-display text-2xl font-light">New task</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div><Label className="mb-1.5 block">Task</Label><Input value={form.title} onChange={(e)=>setForm(f=>({...f,title:e.target.value}))} autoFocus /></div>
            <div><Label className="mb-1.5 block">Assign to</Label>
              <select value={form.assigned_to} onChange={(e)=>setForm(f=>({...f,assigned_to:e.target.value}))} className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm">
                <option value="">Unassigned</option>{advisors.map(a=><option key={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div><Label className="mb-1.5 block">Project</Label>
              <select value={form.project_id} onChange={(e)=>setForm(f=>({...f,project_id:e.target.value}))} className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm">
                <option value="">None</option>{projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="flex justify-end gap-2"><Button variant="ghost" onClick={()=>setOpen(false)}>Cancel</Button><Button onClick={create} disabled={!form.title.trim()}>Create</Button></div>
          </div>
        </DialogContent>
      </Dialog>

      {viewDoc && (
        <DocumentDetailDialog
          doc={viewDoc}
          advisors={advisors}
          company={company}
          onClose={() => setViewDoc(null)}
          onRefresh={async () => {
            const d = await base44.entities.Document.get(viewDoc.id);
            setViewDoc(d);
            load();
          }}
        />
      )}
    </div>
  );
}