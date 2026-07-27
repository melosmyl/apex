// documentDownloads.js — frontend download handler.
// Calls the backend getDocumentDownloadUrl function to verify permissions
// and get the correct file URL + filename, then fetches the file as a blob
// and triggers a proper browser download (not a page navigation).

import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/use-toast";

const FORMAT_LABELS = {
  xlsx: "Excel",
  docx: "Word",
  pptx: "PowerPoint",
  pdf: "PDF",
  csv: "CSV",
};

const FINANCIAL_TYPES = ["Financial Model", "Budget", "Forecast", "Spreadsheet"];
const PRESENTATION_TYPES = ["Pitch Deck", "Presentation"];

// Derives the native file format when native_file_format is not set on the document
function deriveNativeFormat(doc) {
  if (doc?.native_file_format) return doc.native_file_format;
  if (!doc?.native_file_url) return null;
  if (FINANCIAL_TYPES.includes(doc?.document_type)) return "xlsx";
  if (PRESENTATION_TYPES.includes(doc?.document_type)) return "pptx";
  const ext = (doc?.file_name || "").split(".").pop()?.toLowerCase();
  if (ext && FORMAT_LABELS[ext]) return ext;
  return "docx";
}

// Returns the list of download options available for a document.
// Each option: { format, label, icon, available }
export function getDownloadOptions(doc) {
  const options = [];
  const nativeFmt = deriveNativeFormat(doc);

  if (doc?.native_file_url && nativeFmt) {
    options.push({
      format: nativeFmt,
      label: FORMAT_LABELS[nativeFmt] || "Original File",
      available: true,
    });
  }

  if (doc?.pdf_file_url) {
    const isFinancialSummary = doc.native_file_format === "xlsx";
    options.push({
      format: "pdf",
      label: isFinancialSummary ? "PDF Summary" : "PDF",
      available: true,
    });
  }

  return options;
}

// Returns the primary (first available) format for quick-download from cards
export function getPrimaryFormat(doc) {
  const nativeFmt = deriveNativeFormat(doc);
  if (doc?.native_file_url && nativeFmt) return nativeFmt;
  if (doc?.pdf_file_url) return "pdf";
  return null;
}

// Returns file-format badges for display on document cards
export function getFormatBadges(doc) {
  const badges = [];
  const nativeFmt = deriveNativeFormat(doc);
  if (doc?.native_file_url && nativeFmt) {
    badges.push(nativeFmt.toUpperCase());
  }
  if (doc?.pdf_file_url) {
    badges.push("PDF");
  }
  if (doc?.file_url && !doc.native_file_url) {
    badges.push("FILE");
  }
  return badges;
}

// Triggers a secure download of a document file.
// Calls the backend to verify permissions and get the URL, then fetches
// the file as a blob and triggers the browser download with the correct filename.
//
// Options:
//   onStart(format)  — called before the download begins (for loading state)
//   onEnd(format)    — called after the download completes or fails
export async function downloadDocumentFile(documentId, format, options = {}) {
  const { onStart, onEnd } = options;

  if (onStart) onStart(format);

  try {
    const res = await base44.functions.invoke("getDocumentDownloadUrl", {
      document_id: documentId,
      requested_format: format,
    });

    const data = res.data;
    if (!data || data.error) {
      throw new Error(data?.error || "Could not retrieve the file.");
    }

    const { download_url, filename } = data;

    // Fetch the file as a blob to force download behaviour and preserve
    // the correct filename (cross-origin download attribute is unreliable)
    const fetchRes = await fetch(download_url);
    if (!fetchRes.ok) {
      throw new Error("The file could not be retrieved from storage.");
    }

    const blob = await fetchRes.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    // Revoke the object URL after a short delay to ensure download started
    setTimeout(() => URL.revokeObjectURL(url), 2000);

    toast({
      title: "Download started",
      description: filename,
    });
  } catch (error) {
    toast({
      title: "Download unavailable",
      description: error.message || "Could not download the file. Please try again.",
      variant: "destructive",
    });
    throw error;
  } finally {
    if (onEnd) onEnd(format);
  }
}