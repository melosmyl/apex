import React, { useState } from "react";
import { Pin, MoreHorizontal, ExternalLink, Pencil, CheckSquare, Archive, Trash2, Tag, FolderInput } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import AdvisorAvatar from "@/components/AdvisorAvatar";
import { IMPORTANCE_LEVELS, SOURCE_TYPE_LABELS, importanceConfig } from "@/lib/pins";

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

const IMPORTANCE_RING = {
  normal: "",
  important: "ring-1 ring-amber-300/60",
  critical: "ring-2 ring-red-400/70",
};

export default function PinCard({ pin, advisor, onEdit, onViewContext, onConvertToTask, onArchive, onDelete, onMoveCategory }) {
  const [hovered, setHovered] = useState(false);
  const imp = importanceConfig(pin.importance);
  const isCritical = pin.importance === "critical";

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`group bg-card border border-border/70 rounded-2xl p-4 transition-all rise-in ${IMPORTANCE_RING[pin.importance] || ""} ${
        isCritical ? "border-red-200" : ""
      } ${hovered ? "shadow-md" : ""}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${isCritical ? "bg-red-50" : "bg-secondary"}`}>
            <Pin className={`w-3.5 h-3.5 ${isCritical ? "text-red-500" : "text-muted-foreground"}`} />
          </div>
          <Badge variant="secondary" className="rounded-full font-normal text-[10px] shrink-0">{pin.pin_type}</Badge>
        </div>
        <div className="flex items-center gap-1">
          {pin.importance !== "normal" && (
            <span className={`text-[10px] font-medium uppercase tracking-wide ${imp.color}`}>{imp.label}</span>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-secondary">
                <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => onEdit?.(pin)}><Pencil className="w-3.5 h-3.5 mr-2" /> Edit</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onViewContext?.(pin)}><ExternalLink className="w-3.5 h-3.5 mr-2" /> View original context</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onConvertToTask?.(pin)}><CheckSquare className="w-3.5 h-3.5 mr-2" /> Convert to task</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onMoveCategory?.(pin)}><FolderInput className="w-3.5 h-3.5 mr-2" /> Move category</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onArchive?.(pin)}><Archive className="w-3.5 h-3.5 mr-2" /> Archive</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onDelete?.(pin)} className="text-destructive"><Trash2 className="w-3.5 h-3.5 mr-2" /> Delete</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Title & summary */}
      <h3 className="font-display text-base leading-snug mb-1 cursor-pointer hover:text-primary transition-colors" onClick={() => onEdit?.(pin)}>
        {pin.pin_title}
      </h3>
      {pin.summary && <p className="text-sm text-muted-foreground mb-2 line-clamp-2">{pin.summary}</p>}

      {/* Selected text excerpt */}
      {pin.selected_text && (
        <div className="text-xs text-muted-foreground italic border-l-2 border-border/60 pl-2.5 mb-3 line-clamp-3">
          {pin.selected_text}
        </div>
      )}

      {/* Themes & tags */}
      {(pin.themes?.length > 0 || pin.tags?.length > 0) && (
        <div className="flex flex-wrap gap-1 mb-3">
          {pin.themes?.map((t) => (
            <span key={t} className="text-[10px] bg-primary/10 text-primary rounded-full px-2 py-0.5 font-medium">{t}</span>
          ))}
          {pin.tags?.slice(0, 3).map((t) => (
            <span key={t} className="text-[10px] bg-secondary text-muted-foreground rounded-full px-2 py-0.5 flex items-center gap-0.5">
              <Tag className="w-2.5 h-2.5" />{t}
            </span>
          ))}
        </div>
      )}

      {/* Footer: source, advisor, date */}
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground pt-2 border-t border-border/40">
        <div className="flex items-center gap-1.5 min-w-0">
          {advisor && <AdvisorAvatar name={advisor.name} accent={advisor.accent} size="xs" />}
          <button onClick={() => onViewContext?.(pin)} className="truncate hover:text-foreground transition-colors flex items-center gap-1">
            <ExternalLink className="w-3 h-3 shrink-0" />
            <span className="truncate">{SOURCE_TYPE_LABELS[pin.source_type] || pin.source_type}</span>
          </button>
        </div>
        <span className="shrink-0">{timeAgo(pin.created_date)}</span>
      </div>
    </div>
  );
}