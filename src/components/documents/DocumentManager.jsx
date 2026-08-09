import React, { useEffect, useState, useMemo } from "react";
import { useParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import FolderSidebar from "@/components/documents/FolderSidebar";
import DocumentCard from "@/components/documents/DocumentCard";
import DocumentDetailDialog from "@/components/documents/DocumentDetailDialog";
import {
  Plus, Search, LayoutGrid, List, FileText, SlidersHorizontal, X, Paperclip, Loader2, Trash2
} from "lucide-react";
import {
  FOLDERS, DOCUMENT_TYPES, CONTENT_FORMATS, STATUS_CONFIG,
  getTopFolder, getFolderForType, generateDocumentName
} from "@/lib/documents";

const SORT_OPTIONS = [
  { key: "-created_date", label: "Newest" },
  { key: "created_date", label: "Oldest" },
  { key: "-updated_date", label: "Recently Updated" },
  { key: "title", label: "Alphabetical" },
];

export default function DocumentManager({ eyebrow, title, description, emptyText }) {
  const { companyId } = useParams();
  const [items, setItems] = useState(null);
  const [advisors, setAdvisors] = useState([]);
  const [selectedFolder, setSelectedFolder] = useState(null);
  const [search, setSearch] = useState("");
  const [view, setView] = useState("grid");
  const [sort, setSort] = useState("-created_date");
  const [filterType, setFilterType] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [selected, setSelected] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({
    title: "", document_type: "Other", content: "", description: "",
    file_url: "", file_name: "", tags: ""
  });
  const [uploading, setUploading] = useState(false);

  const load = () => {
    base44.entities.Document.filter({ company_id: companyId, kind: "document" }, sort, 200).then(setItems);
    base44.entities.Advisor.filter({ company_id: companyId }, "-created_date", 100).then(setAdvisors);
  };
  useEffect(() => { load(); }, [companyId, sort]);

  // Opens the document named by ?doc= on load — the target of the Share
  // button's copied link. Access is still gated by the founder needing to be
  // logged in as a member of this company; there is no public link yet.
  useEffect(() => {
    if (!items) return;
    const docId = new URLSearchParams(window.location.search).get("doc");
    if (!docId) return;
    const match = items.find((d) => d.id === docId);
    if (match) setSelected(match);
  }, [items]);

  // Compute folder counts
  const folderCounts = useMemo(() => {
    if (!items) return {};
    const counts = { all: items.length };
    FOLDERS.forEach(f => { counts[f.path] = 0; });
    items.forEach(d => {
      const top = getTopFolder(d.folder_path);
      if (top && counts[top] != null) counts[top]++;
    });
    return counts;
  }, [items]);

  // Apply filters
  const filtered = useMemo(() => {
    if (!items) return [];
    return items.filter(d => {
      if (selectedFolder && getTopFolder(d.folder_path) !== selectedFolder) return false;
      if (filterType && d.document_type !== filterType) return false;
      if (filterStatus && d.status !== filterStatus) return false;
      if (search) {
        const q = search.toLowerCase();
        const haystack = [d.title, d.description, d.content, d.document_type, ...(d.tags || [])].join(" ").toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [items, selectedFolder, filterType, filterStatus, search]);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setForm(f => ({ ...f, file_url, file_name: file.name }));
    } finally { setUploading(false); }
  };

  const create = async () => {
    if (!form.title.trim()) return;
    const folder = getFolderForType(form.document_type);
    const tags = form.tags.split(",").map(t => t.trim()).filter(Boolean);
    await base44.entities.Document.create({
      company_id: companyId,
      title: form.title,
      description: form.description,
      document_type: form.document_type,
      folder_path: folder,
      tags,
      content: form.content,
      content_format: "Markdown",
      status: "draft",
      approval_status: "pending",
      version_number: 1,
      is_latest_version: true,
      created_by_user_id: "founder",
      kind: "document",
      file_url: form.file_url || undefined,
      file_name: form.file_name || undefined,
    });
    setForm({ title: "", document_type: "Other", content: "", description: "", file_url: "", file_name: "", tags: "" });
    setCreateOpen(false); load();
  };

  const remove = async (d) => {
    await base44.entities.Document.delete(d.id); setSelected(null); load();
  };

  const hasFilters = filterType || filterStatus || search;

  return (
    <div>
      <PageHeader eyebrow={eyebrow} title={title} description={description}>
        <Button onClick={() => setCreateOpen(true)} className="rounded-full px-5"><Plus className="w-4 h-4 mr-1.5" /> Add Document</Button>
      </PageHeader>

      <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-6">
        {/* Folder sidebar */}
        <div className="lg:sticky lg:top-6 lg:self-start">
          <div className="bg-card border border-border/70 rounded-2xl p-3">
            <FolderSidebar selectedFolder={selectedFolder} onSelect={setSelectedFolder} counts={folderCounts} />
          </div>
        </div>

        {/* Main content */}
        <div>
          {/* Search + toolbar */}
          <div className="flex flex-col sm:flex-row gap-3 mb-5">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search documents, content, tags…"
                className="pl-10 rounded-full"
              />
            </div>
            <div className="flex items-center gap-2">
              <select value={sort} onChange={(e) => setSort(e.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
                {SORT_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
              <Button variant={showFilters ? "default" : "outline"} size="icon" onClick={() => setShowFilters(v => !v)} className="rounded-md">
                <SlidersHorizontal className="w-4 h-4" />
              </Button>
              <div className="flex items-center gap-1 bg-secondary/60 rounded-md p-0.5">
                <button onClick={() => setView("grid")} className={`p-1.5 rounded ${view === "grid" ? "bg-card shadow-sm" : "text-muted-foreground"}`}><LayoutGrid className="w-4 h-4" /></button>
                <button onClick={() => setView("list")} className={`p-1.5 rounded ${view === "list" ? "bg-card shadow-sm" : "text-muted-foreground"}`}><List className="w-4 h-4" /></button>
              </div>
            </div>
          </div>

          {/* Filters panel */}
          {showFilters && (
            <div className="bg-card border border-border/70 rounded-2xl p-4 mb-5 rise-in">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium">Filters</span>
                {hasFilters && (
                  <button onClick={() => { setFilterType(""); setFilterStatus(""); setSearch(""); }} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                    <X className="w-3 h-3" /> Clear all
                  </button>
                )}
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <Label className="mb-1.5 block text-xs">Document Type</Label>
                  <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                    <option value="">All types</option>
                    {DOCUMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <Label className="mb-1.5 block text-xs">Status</Label>
                  <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                    <option value="">All statuses</option>
                    {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Active filter badges */}
          {hasFilters && (
            <div className="flex flex-wrap gap-2 mb-4">
              {filterType && <Badge variant="secondary" className="rounded-full gap-1">{filterType} <button onClick={() => setFilterType("")}><X className="w-3 h-3" /></button></Badge>}
              {filterStatus && <Badge variant="secondary" className="rounded-full gap-1">{(STATUS_CONFIG[filterStatus] || {}).label} <button onClick={() => setFilterStatus("")}><X className="w-3 h-3" /></button></Badge>}
              {search && <Badge variant="secondary" className="rounded-full gap-1">"{search}" <button onClick={() => setSearch("")}><X className="w-3 h-3" /></button></Badge>}
            </div>
          )}

          {/* Document list */}
          {items === null ? (
            <div className="h-40 rounded-2xl bg-secondary/60 animate-pulse" />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={FileText}
              title={hasFilters || selectedFolder ? "No documents match" : "Nothing here yet"}
              description={hasFilters || selectedFolder ? "Try adjusting your filters or search." : emptyText}
              action={!hasFilters && !selectedFolder ? <Button onClick={() => setCreateOpen(true)} className="rounded-full px-6"><Plus className="w-4 h-4 mr-1.5" /> Add Document</Button> : null}
            />
          ) : view === "grid" ? (
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {filtered.map(d => (
                <DocumentCard key={d.id} doc={d} advisor={advisors.find(a => a.id === d.created_by_advisor_id)} onClick={() => setSelected(d)} view="grid" />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map(d => (
                <DocumentCard key={d.id} doc={d} advisor={advisors.find(a => a.id === d.created_by_advisor_id)} onClick={() => setSelected(d)} view="list" />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle className="font-display text-2xl font-light">New Document</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label className="mb-1.5 block">Title</Label>
              <Input value={form.title} onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))} autoFocus placeholder="Document title" />
            </div>
            <div>
              <Label className="mb-1.5 block">Document Type</Label>
              <select value={form.document_type} onChange={(e) => setForm(f => ({ ...f, document_type: e.target.value }))} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                {DOCUMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <p className="text-xs text-muted-foreground mt-1">Auto-filed to: <span className="font-medium">{getFolderForType(form.document_type)}</span></p>
            </div>
            <div>
              <Label className="mb-1.5 block">Description</Label>
              <Input value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Short summary (optional)" />
            </div>
            <div>
              <Label className="mb-1.5 block">Tags (comma-separated)</Label>
              <Input value={form.tags} onChange={(e) => setForm(f => ({ ...f, tags: e.target.value }))} placeholder="Q1, strategy, board" />
            </div>
            <div>
              <Label className="mb-1.5 block">Content (Markdown)</Label>
              <Textarea value={form.content} onChange={(e) => setForm(f => ({ ...f, content: e.target.value }))} rows={5} placeholder="Write or paste document content…" />
            </div>
            <div>
              <Label className="mb-1.5 block">Attachment</Label>
              {form.file_url ? (
                <div className="flex items-center justify-between gap-2 rounded-md border border-input bg-secondary/40 px-3 py-2">
                  <div className="flex items-center gap-2 min-w-0 text-sm"><Paperclip className="w-4 h-4 shrink-0 text-muted-foreground" /><span className="truncate">{form.file_name || "Attachment"}</span></div>
                  <button type="button" onClick={() => setForm(f => ({ ...f, file_url: "", file_name: "" }))} className="text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /></button>
                </div>
              ) : (
                <label className="flex items-center justify-center gap-2 rounded-md border border-dashed border-input bg-secondary/30 px-3 py-4 text-sm text-muted-foreground cursor-pointer hover:bg-secondary/60 transition-colors">
                  {uploading ? <><Loader2 className="w-4 h-4 animate-spin" /> Uploading…</> : <><Paperclip className="w-4 h-4" /> Attach a file</>}
                  <input type="file" onChange={handleFile} className="hidden" disabled={uploading} />
                </label>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button onClick={create} disabled={!form.title.trim() || uploading}>Create Document</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Detail dialog */}
      {selected && (
        <DocumentDetailDialog
          doc={selected}
          advisors={advisors}
          company={null}
          onClose={() => setSelected(null)}
          onRefresh={load}
        />
      )}
    </div>
  );
}