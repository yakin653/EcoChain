/** EcoTree levels from cumulative APPROVED CO₂ (kg). Server-side only. */

export type TreeLevel = "seed" | "sprout" | "sapling" | "tree" | "forest";

export type TreeLevelDef = {
  level: TreeLevel;
  minCo2Kg: number;
  label: string;
};

export const TREE_LEVELS: TreeLevelDef[] = [
  { level: "seed", minCo2Kg: 0, label: "Graine" },
  { level: "sprout", minCo2Kg: 1, label: "Pousse" },
  { level: "sapling", minCo2Kg: 10, label: "Arbuste" },
  { level: "tree", minCo2Kg: 50, label: "Arbre" },
  { level: "forest", minCo2Kg: 200, label: "Forêt" }
];

export function levelFromCo2Kg(co2Kg: number): TreeLevel {
  const n = Number.isFinite(co2Kg) ? Math.max(0, co2Kg) : 0;
  let current: TreeLevel = "seed";
  for (const def of TREE_LEVELS) {
    if (n >= def.minCo2Kg) current = def.level;
  }
  return current;
}

export function nextLevelInfo(co2Kg: number): {
  current: TreeLevel;
  next: TreeLevel | null;
  nextMinCo2Kg: number | null;
  progress01: number;
  remainingKg: number | null;
} {
  const current = levelFromCo2Kg(co2Kg);
  const idx = TREE_LEVELS.findIndex((l) => l.level === current);
  const nextDef = idx >= 0 && idx < TREE_LEVELS.length - 1 ? TREE_LEVELS[idx + 1]! : null;
  if (!nextDef) {
    return { current, next: null, nextMinCo2Kg: null, progress01: 1, remainingKg: null };
  }
  const curMin = TREE_LEVELS[idx]!.minCo2Kg;
  const span = nextDef.minCo2Kg - curMin;
  const progress01 = span <= 0 ? 1 : Math.min(1, Math.max(0, (co2Kg - curMin) / span));
  return {
    current,
    next: nextDef.level,
    nextMinCo2Kg: nextDef.minCo2Kg,
    progress01,
    remainingKg: Math.max(0, Math.round((nextDef.minCo2Kg - co2Kg) * 100) / 100)
  };
}
