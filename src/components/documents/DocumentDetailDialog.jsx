import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import AdvisorAvatar from "@/components/AdvisorAvatar";
import ReactMarkdown from "react-markdown";
import PinnableText from "@/components/pins/PinnableText";
import { usePin } from "@/components/pins/PinContext";
import {
  Check, RefreshCw, Edit3, History, Paperclip, Archive, MessageSquare,
  Save, X, ChevronRight, FileText, AlertTriangle
} from "lucide-react";
import { STATUS_CONFIG, APPROVAL_CONFIG } from "@/lib/documents";

export default function DocumentDetailDialog({
  doc, advisors, onClose, onRefresh, company
}) {
  const { createPin } = usePin();
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [versions, setVersions] = useState([]);
  const [showVersions, setShowVersions] = useState(false);
  const [revisionNotes, setRevisionNotes] = useState("");
  const [showRevision, setShowRevision] = useState(false);
  const [busy, setBusy] = useState(false);

  const advisor = advisors?.find(a => a.id === doc?.created_by_advisor_id);
  const statusConf = doc ? (STATUS_CONFIG[doc.status] || STATUS_CONFIG.draft) : null;
  const approvalConf = doc ? (APPROVAL_CONFIG[doc.approval_status] || APPROVAL_CONFIG.pending) : null;

  useEffect(() => {
    if (!doc) return;
    setEditContent(doc.content || "");
    setEditTitle(doc.title || "");
    base44.entities.Document.update(doc.id, { last_opened_at: new Date().toISOString() }).catch(() => {});
    loadVersions();
  }, [doc?.id]);

  const loadVersions = async () => {
    if (!doc) return;
    try {
      const rootId = doc.parent_document_id || doc.id;
      const childVersions = await base44.entities.Document.filter({
        company_id: doc.company_id,
        parent_document_id: rootId
      }, "-version_number", 50);
      const rootDoc = doc.parent_document_id
        ? await base44.entities.Document.get(doc.parent_document_id)
        : doc;
      setVersions([rootDoc, ...childVersions].filter(Boolean));
    } catch { setVersions([]); }
  };

  if (!doc) return null;

  const approve = async () => {
    setBusy(true);
    try {
      await base44.entities.Document.update(doc.id, {
        status: "approved",
        approval_status: "approved",
        approved_by: "Founder",
        approved_at: new Date().toISOString(),
      });
      onRefresh(); onClose();
    } finally { setBusy(false); }
  };

  const requestRevision = async () => {
    if (!revisionNotes.trim()) return;
    setBusy(true);
    try {
      await base44.entities.Document.update(doc.id, {
        status: "revision_requested",
        approval_status: "revision_requested",
        revision_notes: revisionNotes,
      });
      const newVersion = await base44.entities.Document.create({
        company_id: doc.company_id,
        project_id: doc.project_id,
        task_id: doc.task_id,
        meeting_id: doc.meeting_id,
        decision_id: doc.decision_id,
        created_by_advisor_id: doc.created_by_advisor_id,
        title: doc.title,
        description: doc.description,
        document_type: doc.document_type,
        document_category: doc.document_category,
        folder_path: doc.folder_path,
        tags: doc.tags,
        status: "draft",
        content_format: doc.content_format,
        content: "",
        structured_content: doc.structured_content,
        source_references: doc.source_references,
        version_number: (doc.version_number || 1) + 1,
        parent_document_id: doc.parent_document_id || doc.id,
        is_latest_version: true,
        approval_status: "pending",
        revision_notes: revisionNotes,
        kind: doc.kind || "document",
      });
      await base44.entities.Document.update(doc.id, { is_latest_version: false, status: "superseded" });
      onRefresh(); onClose();
    } finally { setBusy(false); }
  };

  const saveEdit = async () => {
    setBusy(true);
    try {
      await base44.entities.Document.update(doc.id, { content: editContent, title: editTitle, status: doc.status === "approved" ? "draft" : doc.status });
      setEditing(false); onRefresh();
    } finally { setBusy(false); }
  };

  const archive = async () => {
    setBusy(true);
    try {
      await base44.entities.Document.update(doc.id, { status: "archived" });
      onRefresh(); onClose();
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={!!doc} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              {editing ? (
                <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className="text-lg font-display" />
              ) : (
                <DialogTitle className="font-display text-2xl font-light leading-snug">{doc.title}</DialogTitle>
              )}
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <Badge variant="secondary" className={`rounded-full font-normal text-[10px] ${statusConf.color}`}>{statusConf.label}</Badge>
                <Badge variant="secondary" className={`rounded-full font-normal text-[10px] ${approvalConf.color}`}>{approvalConf.label}</Badge>
                <Badge variant="outline" className="rounded-full font-normal text-[10px]">{doc.document_type}</Badge>
                {doc.version_number > 1 && <Badge variant="outline" className="rounded-full font-normal text-[10px]">v{doc.version_number}</Badge>}
                {doc.folder_path && <span className="text-xs text-muted-foreground">{doc.folder_path}</span>}
              </div>
            </div>
          </div>
        </DialogHeader>

        {/* Metadata bar */}
        <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground py-2 border-y border-border/50">
          {advisor && (
            <div className="flex items-center gap-1.5">
              <AdvisorAvatar name={advisor.name} accent={advisor.accent} size="xs" />
              <span>{advisor.name}</span>
            </div>
          )}
          {doc.created_date && <span>{new Date(doc.created_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>}
          {doc.task_id && <span className="flex items-center gap-1"><FileText className="w-3 h-3" /> Linked to task</span>}
          {doc.file_url && (
            <a href={doc.file_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:text-foreground">
              <Paperclip className="w-3 h-3" /> {doc.file_name || "Attachment"}
            </a>
          )}
        </div>

        {/* Content */}
        {editing ? (
          <div className="space-y-3">
            <Label>Content (Markdown)</Label>
            <Textarea value={editContent} onChange={(e) => setEditContent(e.target.value)} rows={18} className="font-mono text-sm" />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => { setEditing(false); setEditContent(doc.content || ""); setEditTitle(doc.title); }}><X className="w-4 h-4 mr-1" /> Cancel</Button>
              <Button onClick={saveEdit} disabled={busy}><Save className="w-4 h-4 mr-1" /> Save</Button>
            </div>
          </div>
        ) : (
          <PinnableText
            companyId={doc.company_id}
            sourceType="document"
            sourceId={doc.id}
            sourceTitle={doc.title}
            sourceUrl={`/company/${doc.company_id}/documents`}
            documentId={doc.id}
            advisorId={doc.created_by_advisor_id}
            projectId={doc.project_id}
            onPin={createPin}
          >
            <div className="prose prose-sm max-w-none text-foreground">
              <ReactMarkdown>{doc.content || doc.description || "No content yet."}</ReactMarkdown>
            </div>
          </PinnableText>
        )}

        {/* Source references */}
        {doc.source_references?.length > 0 && (
          <div className="bg-secondary/40 rounded-xl p-4">
            <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-2">Sources and References</div>
            <ul className="space-y-1">
              {doc.source_references.map((s, i) => <li key={i} className="text-sm flex gap-2"><span className="text-muted-foreground">—</span>{s}</li>)}
            </ul>
          </div>
        )}

        {/* Revision notes */}
        {doc.revision_notes && (
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1"><AlertTriangle className="w-4 h-4 text-orange-600" /><span className="text-[11px] uppercase tracking-widest text-orange-700">Revision Requested</span></div>
            <p className="text-sm text-orange-900">{doc.revision_notes}</p>
          </div>
        )}

        {/* Version history */}
        {versions.length > 1 && (
          <div>
            <button onClick={() => setShowVersions(v => !v)} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
              <History className="w-4 h-4" /> Version History ({versions.length})
              <ChevronRight className={`w-4 h-4 transition-transform ${showVersions ? "rotate-90" : ""}`} />
            </button>
            {showVersions && (
              <div className="mt-2 space-y-1.5">
                {versions.map((v) => (
                  <div key={v.id} className="flex items-center gap-3 text-sm bg-secondary/40 rounded-lg px-3 py-2">
                    <span className="font-medium">v{v.version_number}</span>
                    {v.is_latest_version && <Badge className="rounded-full text-[10px] font-normal">Latest</Badge>}
                    <span className="text-muted-foreground text-xs flex-1">{new Date(v.updated_date || v.created_date).toLocaleDateString("en-GB")}</span>
                    <Badge variant="outline" className="rounded-full text-[10px] font-normal">{(STATUS_CONFIG[v.status] || {}).label || v.status}</Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Action bar */}
        {!editing && (
          <div className="flex flex-wrap items-center gap-2 pt-4 border-t border-border/50">
            {doc.status !== "approved" && doc.status !== "archived" && (
              <Button onClick={approve} disabled={busy} className="rounded-full bg-emerald-700 hover:bg-emerald-800"><Check className="w-4 h-4 mr-1.5" /> Approve</Button>
            )}
            {doc.status !== "approved" && doc.status !== "archived" && !showRevision && (
              <Button variant="outline" onClick={() => setShowRevision(true)} className="rounded-full"><RefreshCw className="w-4 h-4 mr-1.5" /> Request Revision</Button>
            )}
            {showRevision && (
              <div className="w-full space-y-2">
                <Textarea value={revisionNotes} onChange={(e) => setRevisionNotes(e.target.value)} rows={3} placeholder="What needs to change? This feedback goes to the advisor." />
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => { setShowRevision(false); setRevisionNotes(""); }}>Cancel</Button>
                  <Button onClick={requestRevision} disabled={busy || !revisionNotes.trim()} className="rounded-full"><RefreshCw className="w-4 h-4 mr-1.5" /> Send to Advisor</Button>
                </div>
              </div>
            )}
            <Button variant="outline" onClick={() => setEditing(true)} className="rounded-full"><Edit3 className="w-4 h-4 mr-1.5" /> Edit</Button>
            <Button variant="ghost" onClick={archive} disabled={busy || doc.status === "archived"} className="rounded-full"><Archive className="w-4 h-4 mr-1.5" /> Archive</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}