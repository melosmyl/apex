// The browser's copy of supabase/functions/_shared/chair.ts findChair (the
// browser can't import Deno code): the board's Chair is an AI advisor, the
// library Chair first, then one whose role names the chair, oldest first.
// She opens every meeting and writes the resolution; she never debates.
export function findChair(advisors = []) {
  const ai = advisors
    .filter((a) => a && a.type !== "human")
    .sort((a, b) => String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")) || String(a.id ?? "").localeCompare(String(b.id ?? "")));
  return ai.find((a) => a.library_key === "chair") ?? ai.find((a) => String(a.role || "").toLowerCase().includes("chair")) ?? null;
}

// Boards without a Chair get the built-in one for the opening and the
// resolution (BUILT_IN_CHAIR in _shared/chair.ts): the library Chair.
export const BUILT_IN_CHAIR = { id: null, name: "Margaret Ashworth", role: "The Chair" };

export function chairOrBuiltIn(advisors) {
  return findChair(advisors) || BUILT_IN_CHAIR;
}
