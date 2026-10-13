// Model costs are logged in US dollars; founders see pounds, rounded, at a
// fixed rate updated by hand (Workstream M decision).
export const USD_PER_GBP = 1.33;

export function formatCost(usd) {
  const pence = Math.round(((Number(usd) || 0) / USD_PER_GBP) * 100);
  if (pence < 1) return "under 1p";
  if (pence < 100) return `${pence}p`;
  return `£${(pence / 100).toFixed(2)}`;
}
