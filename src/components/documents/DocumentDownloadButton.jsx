import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Download, FileSpreadsheet, FileText, FileDown, Presentation, Loader2, FileX,
} from "lucide-react";
import { getDownloadOptions, downloadDocumentFile } from "@/lib/documentDownloads";

const FORMAT_ICONS = {
  xlsx: FileSpreadsheet,
  docx: FileText,
  pptx: Presentation,
  pdf: FileDown,
  csv: FileSpreadsheet,
};

export default function DocumentDownloadButton({ doc, variant = "default", size = "default", className = "" }) {
  const [downloadingFormat, setDownloadingFormat] = useState(null);
  const options = getDownloadOptions(doc);

  if (options.length === 0) {
    return (
      <Button variant="outline" size={size} className={`rounded-full ${className}`} disabled>
        <FileX className="w-4 h-4 mr-1.5" /> No File Generated
      </Button>
    );
  }

  // If only one format, render a direct button instead of a dropdown
  if (options.length === 1) {
    const opt = options[0];
    const Icon = FORMAT_ICONS[opt.format] || Download;
    const isDownloading = downloadingFormat === opt.format;

    return (
      <Button
        variant={variant}
        size={size}
        className={`rounded-full ${className}`}
        disabled={isDownloading}
        onClick={() =>
          downloadDocumentFile(doc.id, opt.format, {
            onStart: (f) => setDownloadingFormat(f),
            onEnd: () => setDownloadingFormat(null),
          })
        }
      >
        {isDownloading ? (
          <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
        ) : (
          <Icon className="w-4 h-4 mr-1.5" />
        )}
        {isDownloading ? "Preparing…" : `Download ${opt.label}`}
      </Button>
    );
  }

  // Multiple formats: show a dropdown menu
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={variant} size={size} className={`rounded-full ${className}`} disabled={!!downloadingFormat}>
          {downloadingFormat ? (
            <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
          ) : (
            <Download className="w-4 h-4 mr-1.5" />
          )}
          {downloadingFormat ? "Preparing…" : "Download"}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel className="text-xs text-muted-foreground">Available formats</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {options.map((opt) => {
          const Icon = FORMAT_ICONS[opt.format] || Download;
          const isDownloading = downloadingFormat === opt.format;
          return (
            <DropdownMenuItem
              key={opt.format}
              disabled={isDownloading}
              onClick={() =>
                downloadDocumentFile(doc.id, opt.format, {
                  onStart: (f) => setDownloadingFormat(f),
                  onEnd: () => setDownloadingFormat(null),
                })
              }
              className="cursor-pointer"
            >
              {isDownloading ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Icon className="w-4 h-4 mr-2" />
              )}
              <span>Download {opt.label}</span>
              {opt.format === "pdf" && doc.native_file_format === "xlsx" && (
                <span className="ml-auto text-[10px] text-muted-foreground">Summary</span>
              )}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}