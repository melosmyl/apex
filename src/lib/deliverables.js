// deliverables.js — frontend helper for the native file generation system.
// Calls the generate-deliverable backend function which produces genuine
// Excel/PDF files and stores them on the Document entity.

import { base44 } from "@/api/base44Client";

// Triggers native file generation for a task deliverable.
// Returns { document_id, native_file_url, pdf_file_url, ... }
export async function generateDeliverable({ companyId, taskId, advisorId, documentType, topic, customInstructions }) {
  const res = await base44.functions.invoke("generate-deliverable", {
    company_id: companyId,
    task_id: taskId,
    advisor_id: advisorId,
    document_type: documentType,
    topic,
    custom_instructions: customInstructions,
  });
  return res.data;
}

// Regenerates a deliverable as a new version (revision).
export async function regenerateDeliverable({ companyId, documentId, customInstructions }) {
  const res = await base44.functions.invoke("generate-deliverable", {
    company_id: companyId,
    revision_of: documentId,
    custom_instructions: customInstructions,
  });
  return res.data;
}

// Document types that produce native Excel workbooks
export const EXCEL_TYPES = ["Financial Model", "Budget", "Forecast", "Spreadsheet"];

// Document types that produce editable Word documents
export const DOCX_TYPES = [
  "Report", "Strategy", "Business Plan", "Market Research", "Competitor Analysis",
  "Board Resolution", "Decision Memo", "Risk Assessment", "Proposal", "Research Paper",
  "Marketing Plan", "Campaign Plan", "Brand Brief", "Creative Brief", "Product Specification",
  "Project Plan", "Timeline", "Meeting Summary", "Email Draft", "Letter", "Contract Draft",
  "Policy", "Checklist", "Template", "Supplier Comparison", "Customer Persona", "Launch Plan",
  "Other",
];

// Document types that produce PDF-only (slide-based / visual)
export const PRESENTATION_TYPES = ["Pitch Deck", "Presentation"];

export function getNativeFormatLabel(doc) {
  const fmt = doc?.native_file_format;
  if (fmt === "xlsx") return "Excel Workbook (.xlsx)";
  if (fmt === "docx") return "Word Document (.docx)";
  if (fmt === "pptx") return "PowerPoint Deck (.pptx)";
  if (fmt === "pdf") return "PDF Report (.pdf)";
  if (doc?.file_url) return "Attached File";
  return "No file generated";
}

export function isNativeFileDoc(doc) {
  return !!(doc?.native_file_url || doc?.pdf_file_url);
}