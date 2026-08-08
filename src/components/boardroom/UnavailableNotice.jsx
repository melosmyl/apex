import React from "react";
import { AlertTriangle } from "lucide-react";

export default function UnavailableNotice({ children, className = "" }) {
  return (
    <div className={`flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 ${className}`}>
      <AlertTriangle className="w-3.5 h-3.5 text-destructive/80 shrink-0 mt-0.5" />
      <p className="text-xs leading-relaxed text-destructive/90">{children}</p>
    </div>
  );
}
