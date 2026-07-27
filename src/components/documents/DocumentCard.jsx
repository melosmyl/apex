import React, { useState } from "react";
import { FileText, User, Clock, Download, Loader2, ShieldCheck, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import AdvisorAvatar from "@/components/AdvisorAvatar";
import { STATUS_CONFIG, QUALITY_CONFIG } from "@/lib/documents";
import { getFormatBadges, getPrimaryFormat, downloadDocumentFile } from "@/lib/documentDownloads";

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

function FormatBadges({ doc }) {
  const badges = getFormatBadges(doc);
  if (badges.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {badges.map((b) => (
        <span key={b} className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground uppercase tracking-wide">
          {b}
        </span>
      ))}
    </div>
  );
}

export default function DocumentCard({ doc, advisor, onClick, view = "grid" }) {
  const [downloading, setDownloading] = useState(false);
  const statusConf = STATUS_CONFIG[doc.status] || STATUS_CONFIG.draft;
  const qualityConf = QUALITY_CONFIG[doc.quality_check_status];
  const createdByName = doc.created_by_advisor_id && advisor ? advisor.name : doc.created_by_user_id ? "Founder" : "—";
  const primaryFormat = getPrimaryFormat(doc);
  const hasFile = !!primaryFormat;

  const handleDownload = (e) => {
    e.stopPropagation();
    if (!primaryFormat || downloading) return;
    downloadDocumentFile(doc.id, primaryFormat, {
      onStart: () => setDownloading(true),
      onEnd: () => setDownloading(false),
    });
  };

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
          <FormatBadges doc={doc} />
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
        {hasFile && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full shrink-0"
            onClick={handleDownload}
            disabled={downloading}
            title={`Download ${primaryFormat?.toUpperCase()}`}
          >
            {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          </Button>
        )}
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
        <div className="flex flex-col items-end gap-1">
          <Badge variant="secondary" className={`rounded-full font-normal text-[10px] ${statusConf.color}`}>{statusConf.label}</Badge>
          {qualityConf && (
            <Badge variant="outline" className={`rounded-full font-normal text-[9px] ${qualityConf.color}`}>
              {qualityConf.status === "passed" ? <ShieldCheck className="w-2.5 h-2.5 mr-0.5" /> : <AlertTriangle className="w-2.5 h-2.5 mr-0.5" />}
              QA
            </Badge>
          )}
        </div>
      </div>
      <h3 className="font-display text-base leading-snug mb-1 line-clamp-2">{doc.title}</h3>
      <p className="text-xs text-muted-foreground mb-2">{doc.document_type}</p>
      {doc.description && <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{doc.description}</p>}

      {/* Format badges + file info */}
      <div className="flex items-center gap-2 mb-3">
        <FormatBadges doc={doc} />
        {doc.file_size > 0 && (
          <span className="text-[10px] text-muted-foreground">{(doc.file_size / 1024).toFixed(0)} KB</span>
        )}
        {doc.version_number > 1 && (
          <span className="text-[10px] text-muted-foreground">v{doc.version_number}</span>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5 min-w-0">
          {doc.created_by_advisor_id && advisor ? (
            <AdvisorAvatar name={advisor.name} accent={advisor.accent} size="xs" />
          ) : (
            <User className="w-3 h-3" />
          )}
          <span className="truncate">{createdByName.split(" ")[0]}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Clock className="w-3 h-3" />
          <span>{timeAgo(doc.updated_date || doc.created_date)}</span>
        </div>
      </div>

      {hasFile ? (
        <Button
          variant="outline"
          className="w-full rounded-full mt-3 group-hover:border-brand/40"
          onClick={handleDownload}
          disabled={downloading}
        >
          {downloading ? (
            <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Preparing…</>
          ) : (
            <><Download className="w-4 h-4 mr-1.5" /> Download {primaryFormat?.toUpperCase()}</>
          )}
        </Button>
      ) : doc.status === "failed" ? (
        <div className="mt-3 text-center text-xs text-red-600 bg-red-50 rounded-lg py-2">Generation failed</div>
      ) : null}
    </div>
  );
}