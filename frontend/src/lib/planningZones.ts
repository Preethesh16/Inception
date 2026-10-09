// Stable across both maps; marker colours remain forecast stock risk.
const styles: Record<string, { color: string; dash: string }> = {
  ORS: { color: "#d97706", dash: "8 4" },
  SAL: { color: "#7c3aed", dash: "3 4" },
  MSK: { color: "#2563eb", dash: "10 3 2 3" },
};
const names: Record<string, string> = {
  ORS: "Oral rehydration salts",
  SAL: "IV saline 500 ml",
  MSK: "Surgical masks",
};
export const zoneStyle = (id: string) => styles[id] || { color: "#64748b", dash: "5 5" };
export const zoneName = (id: string) => names[id] || id;
