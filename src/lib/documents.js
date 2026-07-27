// Document organisation system: folders, types, formats, templates, naming, status config

export const FOLDERS = [
  { id: "01", name: "01 Strategy", path: "01 Strategy" },
  { id: "02", name: "02 Research", path: "02 Research" },
  { id: "03", name: "03 Finance", path: "03 Finance" },
  { id: "04", name: "04 Brand and Creative", path: "04 Brand and Creative" },
  { id: "05", name: "05 Marketing", path: "05 Marketing" },
  { id: "06", name: "06 Product", path: "06 Product" },
  { id: "07", name: "07 Operations", path: "07 Operations" },
  { id: "08", name: "08 Sales", path: "08 Sales" },
  { id: "09", name: "09 Investors and Fundraising", path: "09 Investors and Fundraising" },
  { id: "10", name: "10 Legal and Compliance", path: "10 Legal and Compliance" },
  { id: "11", name: "11 People and Culture", path: "11 People and Culture" },
  { id: "12", name: "12 Meetings and Decisions", path: "12 Meetings and Decisions" },
  { id: "13", name: "13 Projects", path: "13 Projects" },
  { id: "14", name: "14 Templates", path: "14 Templates" },
  { id: "15", name: "15 Archive", path: "15 Archive" },
];

export const ALL_FOLDER = { id: "all", name: "All Documents", path: null };

// Maps document_type to { folder, subfolder }
const FOLDER_MAP = {
  "Strategy": { folder: "01 Strategy", subfolder: null },
  "Business Plan": { folder: "01 Strategy", subfolder: "Business Plans" },
  "Report": { folder: "01 Strategy", subfolder: "Reports" },
  "Proposal": { folder: "01 Strategy", subfolder: "Proposals" },
  "Risk Assessment": { folder: "01 Strategy", subfolder: "Risk Assessments" },
  "Research Paper": { folder: "02 Research", subfolder: "Research Papers" },
  "Market Research": { folder: "02 Research", subfolder: "Market Research" },
  "Competitor Analysis": { folder: "02 Research", subfolder: "Competitor Analysis" },
  "Customer Persona": { folder: "02 Research", subfolder: "Customer Personas" },
  "Financial Model": { folder: "03 Finance", subfolder: "Financial Models" },
  "Budget": { folder: "03 Finance", subfolder: "Budgets" },
  "Forecast": { folder: "03 Finance", subfolder: "Forecasts" },
  "Spreadsheet": { folder: "03 Finance", subfolder: "Spreadsheets" },
  "Brand Brief": { folder: "04 Brand and Creative", subfolder: "Brand Briefs" },
  "Creative Brief": { folder: "04 Brand and Creative", subfolder: "Creative Briefs" },
  "Marketing Plan": { folder: "05 Marketing", subfolder: "Marketing Plans" },
  "Campaign Plan": { folder: "05 Marketing", subfolder: "Campaign Plans" },
  "Launch Plan": { folder: "05 Marketing", subfolder: "Launch Plans" },
  "Product Specification": { folder: "06 Product", subfolder: "Product Specs" },
  "Supplier Comparison": { folder: "07 Operations", subfolder: "Suppliers" },
  "Presentation": { folder: "08 Sales", subfolder: "Presentations" },
  "Pitch Deck": { folder: "09 Investors and Fundraising", subfolder: "Pitch Decks" },
  "Contract Draft": { folder: "10 Legal and Compliance", subfolder: "Contracts" },
  "Policy": { folder: "10 Legal and Compliance", subfolder: "Policies" },
  "Letter": { folder: "10 Legal and Compliance", subfolder: "Letters" },
  "Email Draft": { folder: "11 People and Culture", subfolder: "Email Drafts" },
  "Meeting Summary": { folder: "12 Meetings and Decisions", subfolder: "Meeting Summaries" },
  "Board Resolution": { folder: "12 Meetings and Decisions", subfolder: "Board Resolutions" },
  "Decision Memo": { folder: "12 Meetings and Decisions", subfolder: "Decision Memos" },
  "Project Plan": { folder: "13 Projects", subfolder: "Project Plans" },
  "Timeline": { folder: "13 Projects", subfolder: "Timelines" },
  "Checklist": { folder: "14 Templates", subfolder: "Checklists" },
  "Template": { folder: "14 Templates", subfolder: "Templates" },
  "Other": { folder: "01 Strategy", subfolder: "General" },
};

export function getFolderForType(docType) {
  const mapping = FOLDER_MAP[docType] || FOLDER_MAP["Other"];
  return mapping.subfolder ? `${mapping.folder} / ${mapping.subfolder}` : mapping.folder;
}

export function getTopFolder(folderPath) {
  if (!folderPath) return null;
  return folderPath.split(" / ")[0];
}

export const DOCUMENT_TYPES = [
  "Report", "Research Paper", "Strategy", "Business Plan", "Pitch Deck",
  "Presentation", "Spreadsheet", "Financial Model", "Budget", "Forecast",
  "Competitor Analysis", "Market Research", "Marketing Plan", "Campaign Plan",
  "Brand Brief", "Creative Brief", "Product Specification", "Project Plan",
  "Timeline", "Meeting Summary", "Board Resolution", "Decision Memo", "Proposal",
  "Email Draft", "Letter", "Contract Draft", "Policy", "Checklist", "Template",
  "Supplier Comparison", "Customer Persona", "Launch Plan", "Risk Assessment", "Other",
];

export const CONTENT_FORMATS = [
  "Rich text", "Structured document", "Spreadsheet", "Presentation",
  "PDF", "DOCX", "XLSX", "PPTX", "CSV", "Markdown", "Plain text",
];

export const STATUS_CONFIG = {
  draft: { label: "Draft", color: "bg-slate-100 text-slate-600" },
  generating: { label: "Generating File…", color: "bg-blue-100 text-blue-700" },
  in_progress: { label: "In Progress", color: "bg-blue-100 text-blue-700" },
  ready_for_review: { label: "Ready for Review", color: "bg-amber-100 text-amber-700" },
  revision_requested: { label: "Revision Requested", color: "bg-orange-100 text-orange-700" },
  approved: { label: "Approved", color: "bg-emerald-100 text-emerald-700" },
  superseded: { label: "Superseded", color: "bg-slate-100 text-slate-400" },
  archived: { label: "Archived", color: "bg-slate-100 text-slate-400" },
  failed: { label: "Generation Failed", color: "bg-red-100 text-red-700" },
};

export const QUALITY_CONFIG = {
  pending: { label: "Quality Check Pending", color: "bg-slate-100 text-slate-600" },
  passed: { label: "Quality Check Passed", color: "bg-emerald-100 text-emerald-700" },
  failed: { label: "Quality Check Failed", color: "bg-red-100 text-red-700" },
};

export const ASSUMPTIONS_CONFIG = {
  complete: { label: "Assumptions Complete", color: "bg-emerald-100 text-emerald-700" },
  needs_confirmation: { label: "Assumptions Need Confirmation", color: "bg-amber-100 text-amber-700" },
  missing: { label: "Assumptions Missing", color: "bg-red-100 text-red-700" },
};

export const APPROVAL_CONFIG = {
  pending: { label: "Pending", color: "bg-amber-100 text-amber-700" },
  approved: { label: "Approved", color: "bg-emerald-100 text-emerald-700" },
  revision_requested: { label: "Revision Requested", color: "bg-orange-100 text-orange-700" },
  rejected: { label: "Rejected", color: "bg-red-100 text-red-700" },
};

// Template definitions: section structure per document type
export const DOCUMENT_TEMPLATES = {
  "Business Plan": {
    sections: ["Executive Summary", "Company Overview", "Market Opportunity", "Product or Service", "Business Model", "Go-to-Market Strategy", "Team", "Financial Projections", "Funding Requirements", "Risks and Mitigation"],
  },
  "Market Research": {
    sections: ["Research Question", "Executive Summary", "Method", "Key Findings", "Evidence", "Sources", "Contradictory Findings", "Limitations", "Strategic Implications", "Recommendations", "Next Research Questions"],
  },
  "Competitor Analysis": {
    sections: ["Executive Summary", "Competitor Profiles", "Market Positioning", "Strengths and Weaknesses", "Pricing Comparison", "Product Comparison", "Strategic Implications", "Recommendations"],
  },
  "Financial Model": {
    sections: ["Model Overview", "Key Assumptions", "Revenue Projections", "Cost Structure", "Cash Flow", "Break-Even Analysis", "Sensitivity Analysis", "Important Outputs", "How to Edit", "Risks and Limitations"],
  },
  "Creative Brief": {
    sections: ["Project Overview", "Objective", "Target Audience", "Key Message", "Tone and Voice", "Deliverables", "Timeline", "Budget", "Constraints", "Inspirations and References"],
  },
  "Strategy": {
    sections: ["Executive Summary", "Current Situation", "Strategic Objectives", "Options Analysis", "Recommended Strategy", "Implementation Roadmap", "Resource Requirements", "Key Risks", "Success Metrics"],
  },
  "Decision Memo": {
    sections: ["Decision Required", "Background", "Options Considered", "Analysis", "Recommendation", "Risks", "Next Actions"],
  },
  "Board Resolution": {
    sections: ["Resolution Title", "Date", "Board Members Present", "Question", "Discussion Summary", "Areas of Agreement", "Areas of Disagreement", "Resolution", "Dissenting Opinions", "Action Items"],
  },
  "Meeting Summary": {
    sections: ["Meeting Title", "Date", "Attendees", "Agenda", "Key Discussion Points", "Decisions Made", "Action Items", "Next Meeting"],
  },
  "Risk Assessment": {
    sections: ["Overview", "Risk Identification", "Risk Analysis", "Risk Evaluation", "Mitigation Strategies", "Monitoring Plan", "Recommendations"],
  },
  "Supplier Comparison": {
    sections: ["Summary", "Evaluation Criteria", "Supplier Profiles", "Comparison Matrix", "Recommendation", "Next Steps"],
  },
  "Launch Plan": {
    sections: ["Launch Overview", "Objectives", "Target Audience", "Timeline", "Channels", "Budget", "Success Metrics", "Risks", "Contingency Plan"],
  },
};

export function generateDocumentName(companyName, docType, topic) {
  const date = new Date().toISOString().split("T")[0];
  const cleanCompany = (companyName || "Company").trim();
  const cleanType = docType || "Document";
  const cleanTopic = topic ? ` – ${topic.trim()}` : "";
  return `${cleanCompany} – ${cleanType}${cleanTopic} – ${date}`;
}

// Formats a structured LLM deliverable response into readable markdown content
export function formatDeliverableContent(deliverable) {
  let md = `## Executive Summary\n\n${deliverable.executive_summary || ""}\n\n`;
  md += `## Main Content\n\n${deliverable.main_content || deliverable.content || ""}\n`;
  if (deliverable.assumptions?.length) {
    md += `\n## Assumptions\n\n${deliverable.assumptions.map(a => `- ${a}`).join("\n")}\n`;
  }
  if (deliverable.risks?.length) {
    md += `\n## Risks and Limitations\n\n${deliverable.risks.map(r => `- ${r}`).join("\n")}\n`;
  }
  if (deliverable.source_references?.length) {
    md += `\n## Sources and References\n\n${deliverable.source_references.map(s => `- ${s}`).join("\n")}\n`;
  }
  if (deliverable.recommended_next_actions?.length) {
    md += `\n## Recommended Next Actions\n\n${deliverable.recommended_next_actions.map(a => `- ${a}`).join("\n")}\n`;
  }
  return md;
}