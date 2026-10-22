// Task departments (Workstream T). The six departments and their colours are
// the owner's (15 October 2026): each has a band colour and a partner colour
// from the rug palette, and nothing else. Text on each is ink or white,
// whichever passes WCAG AA (4.5:1): on Finance's green, white is 3.6:1, so the
// band's text is ink. A chip is the partner colour, since no department
// colour passes as text on its own partner.

const INK = "#2B0F18";
const WHITE = "#FFFFFF";

export const DEPARTMENTS = [
  { key: "product", label: "Product", band: "#4C6CB8", bandText: WHITE, chip: "#EE9C88", chipText: INK },
  { key: "marketing", label: "Marketing", band: "#E27DA9", bandText: INK, chip: "#1E5A43", chipText: WHITE },
  { key: "sales", label: "Sales", band: "#F0A646", bandText: INK, chip: "#A83A2C", chipText: WHITE },
  { key: "finance", label: "Finance", band: "#3E9A46", bandText: INK, chip: "#F4E3A8", chipText: INK },
  { key: "legal", label: "Legal", band: "#5145A5", bandText: WHITE, chip: "#E3B898", chipText: INK },
  { key: "ops", label: "Ops", band: "#8C5A2B", bandText: WHITE, chip: "#2E3D5C", chipText: WHITE },
];

const BY_KEY = new Map(DEPARTMENTS.map((d) => [d.key, d]));

// A task without a known department (an old row, a value from elsewhere) is Ops.
export const departmentOf = (key) => BY_KEY.get(key) || BY_KEY.get("ops");
export const isDepartment = (key) => BY_KEY.has(key);

// An advisor's home department. The same rules as the database's
// department_for_advisor() (migration 20261022140000_t_task_board.sql),
// which decides for tasks made without one: keep the two in step.
const BY_LIBRARY_KEY = {
  product: ["product_strategist", "ai_expert", "felix-hart", "nathan-cole", "scientist", "innovation_director", "visionary"],
  marketing: ["marketing_director", "creative_director", "theo-lindqvist"],
  sales: ["customer_advocate"],
  finance: ["marcus-delgado", "investor", "arthur-penrose", "capital_allocator"],
  legal: ["legal_advisor", "risk_analyst"],
  ops: ["operator", "supply_chain", "people_culture", "contrarian", "chair"],
};
const ROLE_WORDS = [
  ["sales", /(account manager|account executive|\bsales|\bselling|\bcustomer|business development|partnership)/i],
  ["finance", /(\bfinanc|\baccountant|\baccounting|\bbookkeep|\bcfo\b|\binvest(or|ors|ment|ments|ing)?\b|\btreasur|\bcapital\b)/i],
  ["legal", /(\blegal|\blawyer|\bsolicitor|\battorney|\bcounsel\b|\bcompliance|\brisk)/i],
  ["product", /(\bproducts?\b|\bux\b|\bui\b|\btechnolog|\bengineer|\bdeveloper|\bcto\b|\bscien|\binnovat|\bresearch)/i],
  ["marketing", /(\bmarketing|\bmarketer|\bbrand|\bcreative|\bdesigner|\bdesign\b|\bcontent|social media|\bcopywrit|\bcommunications)/i],
];

export function departmentForAdvisor(advisor) {
  if (!advisor) return "ops";
  for (const [dept, keys] of Object.entries(BY_LIBRARY_KEY)) {
    if (keys.includes(advisor.library_key)) return dept;
  }
  const role = advisor.role || "";
  return ROLE_WORDS.find(([, re]) => re.test(role))?.[0] || "ops";
}

// What a card shows in bold: the short title once it's written, otherwise
// the task's own wording (already short, or still waiting for one).
export const cardTitle = (task) => task.short_title || task.title;
// The full wording under the bold title, only when it says more.
export const fullWording = (task) => (task.short_title && task.short_title !== task.title ? task.title : null);
