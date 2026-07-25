import { base44 } from "@/api/base44Client";

export const PIN_CATEGORIES = [
  "Strategy", "Vision and Mission", "Product", "Customer", "Market Research",
  "Competitors", "Brand", "Creative", "Marketing", "Sales", "Finance",
  "Fundraising", "Operations", "Supply Chain", "Manufacturing",
  "Legal and Compliance", "People and Hiring", "Technology", "Risk",
  "Ideas and Opportunities", "Decisions", "Lessons Learned", "Actions", "Other"
];

export const PIN_TYPES = [
  "Insight", "Idea", "Recommendation", "Risk", "Warning", "Assumption",
  "Evidence", "Decision", "Question", "Action", "Quote", "Lesson"
];

export const IMPORTANCE_LEVELS = [
  { value: "normal", label: "Normal", color: "text-muted-foreground" },
  { value: "important", label: "Important", color: "text-amber-600" },
  { value: "critical", label: "Critical", color: "text-red-600" },
];

export const SOURCE_TYPE_LABELS = {
  board_resolution: "Board Resolution",
  executive_discussion: "Executive Discussion",
  advisor_perspective: "Advisor Perspective",
  challenge_round: "Challenge Round",
  research_report: "Research Report",
  document: "Document",
  decision_memo: "Decision Memo",
  meeting_summary: "Meeting Summary",
  task: "Task",
  project_discussion: "Project Discussion",
  ai_conversation: "AI Conversation",
};

export async function analyzePin({ companyId, selectedText, surroundingContext, sourceType, sourceTitle }) {
  const res = await base44.functions.invoke("analyzePin", {
    company_id: companyId,
    selected_text: selectedText,
    surrounding_context: surroundingContext || "",
    source_type: sourceType,
    source_title: sourceTitle,
  });
  if (res.data?.error) throw new Error(res.data.error);
  return res.data;
}

export async function createPin(data) {
  return await base44.entities.Pin.create(data);
}

export async function updatePin(id, data) {
  return await base44.entities.Pin.update(id, data);
}

export async function deletePin(id) {
  return await base44.entities.Pin.delete(id);
}

export async function convertPinToTask(pin, companyId) {
  const task = await base44.entities.Task.create({
    company_id: companyId,
    project_id: pin.project_id || undefined,
    title: pin.pin_title || pin.selected_text?.slice(0, 100) || "From Pin",
    description: `${pin.summary || ""}\n\nOriginal text:\n${pin.selected_text || ""}`,
    status: "todo",
    created_by: "Founder",
  });
  return task;
}

export function importanceConfig(value) {
  return IMPORTANCE_LEVELS.find((i) => i.value === value) || IMPORTANCE_LEVELS[0];
}