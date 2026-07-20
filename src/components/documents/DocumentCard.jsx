import React from "react";
import { FileText, Paperclip, User, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import AdvisorAvatar from "@/components/AdvisorAvatar";
import { STATUS_CONFIG } from "@/lib/documents";

function timeAgo(dateStr) {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days > 30) return new Date(dateStr).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  if (days > 0) return `${days}d ago`;
  const hours = Math.floor(diff / 3600000);
  if (hours > 0) return `${hours}h ago`;
  const mins = Math.floor(diff / 60000);
  return mins > 0 ? `${mins}m ago` : "just now";
}

export default function DocumentCard({ doc, advisor, onClick, view = "grid" }) {
  const statusConf = STATUS_CONFIG[doc.status] || STATUS_CONFIG.draft;
  const createdByName = doc.created_by_advisor_id && advisor ? advisor.name : doc.created_by_user_id ? "Founder" : "—";

  if (view === "list") {
    return (
      <div
        onClick={onClick}
        className="group flex items-center gap-4 bg-card border border-border/70 rounded-xl px-4 py-3 cursor-pointer hover:shadow-sm hover:border-border transition-all rise-in"
      >
        <div className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center shrink-0">
          <FileText className="w-4 h-4 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{doc.title}</p>
          <p className="text-xs text-muted-foreground truncate">{doc.folder_path || "Unfiled"}</p>
        </div>
        <div className="hidden md:block w-32 shrink-0">
          <span className="text-xs text-muted-foreground">{doc.document_type}</span>
        </div>
        <div className="hidden lg:flex items-center gap-1.5 w-28 shrink-0">
          {doc.created_by_advisor_id && advisor ? (
            <AdvisorAvatar name={advisor.name} accent={advisor.accent} size="xs" />
          ) : (
            <User className="w-3 h-3 text-muted-foreground" />
          )}
          <span className="text-xs text-muted-foreground truncate">{createdByName.split(" ")[0]}</span>
        </div>
        <div className="w-24 shrink-0">
          <Badge variant="secondary" className={`rounded-full font-normal text-[10px] ${statusConf.color}`}>{statusConf.label}</Badge>
        </div>
        <div className="hidden sm:flex items-center gap-1 w-20 shrink-0 text-xs text-muted-foreground">
          {doc.version_number > 1 && <span>v{doc.version_number}</span>}
          <Clock className="w-3 h-3" />
          <span>{timeAgo(doc.updated_date || doc.created_date)}</span>
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={onClick}
      className="group bg-card border border-border/70 rounded-2xl p-5 cursor-pointer hover:shadow-md hover:border-border transition-all rise-in"
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center shrink-0">
          <FileText className="w-5 h-5 text-muted-foreground" />
        </div>
        <Badge variant="secondary" className={`rounded-full font-normal text-[10px] ${statusConf.color}`}>{statusConf.label}</Badge>
      </div>
      <h3 className="font-display text-base leading-snug mb-1 line-clamp-2">{doc.title}</h3>
      <p className="text-xs text-muted-foreground mb-3">{doc.document_type}</p>
      {doc.description && <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{doc.description}</p>}
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5 min-w-0">
          {doc.created_by_advisor_id && advisor ? (
            <AdvisorAvatar name={advisor.name} accent={advisor.accent} size="xs" />
          ) : (
            <User className="w-3 h-3" />
          )}
          <span className="truncate">{createdByName.split(" ")[0]}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {doc.version_number > 1 && <span>v{doc.version_number}</span>}
          {doc.file_url && <Paperclip className="w-3 h-3" />}
          <span>{timeAgo(doc.updated_date || doc.created_date)}</span>
        </div>
      </div>
    </div>
  );
}