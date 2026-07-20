import React from "react";
import { Folder, Inbox } from "lucide-react";
import { FOLDERS, ALL_FOLDER } from "@/lib/documents";

export default function FolderSidebar({ selectedFolder, onSelect, counts }) {
  return (
    <div className="space-y-0.5">
      <button
        onClick={() => onSelect(ALL_FOLDER.path)}
        className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
          selectedFolder === null ? "bg-primary text-primary-foreground" : "hover:bg-accent text-muted-foreground"
        }`}
      >
        <Inbox className="w-4 h-4 shrink-0" />
        <span className="flex-1 text-left">{ALL_FOLDER.name}</span>
        {counts?.all != null && <span className="text-xs opacity-70">{counts.all}</span>}
      </button>
      <div className="pt-2 pb-1 px-3">
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Folders</span>
      </div>
      {FOLDERS.map((f) => {
        const count = counts?.[f.path] || 0;
        const isActive = selectedFolder === f.path;
        return (
          <button
            key={f.id}
            onClick={() => onSelect(f.path)}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
              isActive ? "bg-primary text-primary-foreground" : "hover:bg-accent text-muted-foreground"
            }`}
          >
            <Folder className="w-4 h-4 shrink-0" />
            <span className="flex-1 text-left truncate">{f.name}</span>
            {count > 0 && <span className="text-xs opacity-70">{count}</span>}
          </button>
        );
      })}
    </div>
  );
}