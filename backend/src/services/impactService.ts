/**
 * ECO IMPACT — environmental aggregates from APPROVED declarations only.
 * Factors are pedagogical estimates (kg CO₂ avoided per kg recycled), not lab measurements.
 */

import type { Pool } from "pg";
import { pool as defaultPool } from "../db/pool";
import { normalizeMaterial, weiToEcoString } from "./rewardPolicy";

/** Approximate kg CO₂ avoided per kg of recycled material (demo / academic). */
export const CO2_KG_PER_MATERIAL_KG: Record<string, number> = {
  plastic: 1.5,
  metal: 2.0,
  aluminum: 9.0,
  glass: 0.3,
  paper: 0.9,
  cardboard: 0.8,
  organic: 0.2,
  electronic: 4.0,
  other: 0.5
};

const KG_CO2_PER_TREE_YEAR = 21;
const KG_CO2_PER_CAR_KM = 0.12;

export type ImpactMaterialSlice = {
  materialKey: string;
  label: string;
  quantityKg: number;
  co2Kg: number;
  declarations: number;
  percentOfTotalKg: number;
};

export type ImpactSeriesPoint = {
  period: string;
  quantityKg: number;
  co2Kg: number;
  declarations: number;
};

export type ImpactHistoryItem = {
  id: string;
  material: string;
  materialKey: string;
  quantityKg: number;
  co2Kg: number;
  rewardEco: string | null;
  processedAt: string | null;
  createdAt: string;
  txHash: string | null;
};

export type ImpactTopContributor = {
  userId: string;
  fullName: string;
  email: string;
  quantityKg: number;
  co2Kg: number;
  declarations: number;
};

export type ImpactDashboard = {
  scope: "user" | "platform";
  totals: {
    quantityKg: number;
    co2Kg: number;
    approvedDeclarations: number;
    ecoRewarded: string;
    treesEquivalent: number;
    carKmEquivalent: number;
  };
  byMaterial: ImpactMaterialSlice[];
  weekly: ImpactSeriesPoint[];
  monthly: ImpactSeriesPoint[];
  recent: ImpactHistoryItem[];
  topContributors?: ImpactTopContributor[];
  methodology: {
    onlyApproved: true;
    co2FactorsKgPerKg: Record<string, number>;
    treesNote: string;
    carNote: string;
  };
};

const MATERIAL_LABELS: Record<string, string> = {
  plastic: "Plastique",
  metal: "Métal",
  aluminum: "Aluminium",
  glass: "Verre",
  paper: "Papier",
  cardboard: "Carton",
  organic: "Organique",
  electronic: "Électronique",
  other: "Autre"
};

export function co2ForMaterialKg(materialRaw: string, quantityKg: number): number {
  const key = normalizeMaterial(materialRaw);
  const factor = CO2_KG_PER_MATERIAL_KG[key] ?? CO2_KG_PER_MATERIAL_KG.other!;
  return round2(quantityKg * factor);
}

export function deriveEquivalents(co2Kg: number) {
  return {
    treesEquivalent: round2(co2Kg / KG_CO2_PER_TREE_YEAR),
    carKmEquivalent: round2(co2Kg / KG_CO2_PER_CAR_KM)
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function toKg(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) ? n : 0;
}

type DeclRow = {
  id: string;
  user_id: string;
  material: string;
  quantity: string | number;
  reward_amount: string | null;
  tx_hash: string | null;
  processed_at: Date | string | null;
  created_at: Date | string;
  full_name?: string;
  email?: string;
};

function buildFromRows(rows: DeclRow[], scope: "user" | "platform", includeTop = false): ImpactDashboard {
  let totalKg = 0;
  let totalCo2 = 0;
  let totalRewardWei = 0n;
  const byMat = new Map<string, { quantityKg: number; co2Kg: number; declarations: number }>();
  const weeklyMap = new Map<string, ImpactSeriesPoint>();
  const monthlyMap = new Map<string, ImpactSeriesPoint>();
  const byUser = new Map<string, ImpactTopContributor>();

  for (const row of rows) {
    const kg = toKg(row.quantity);
    const key = normalizeMaterial(row.material);
    const co2 = co2ForMaterialKg(row.material, kg);
    totalKg += kg;
    totalCo2 += co2;
    if (row.reward_amount) {
      try {
        totalRewardWei += BigInt(row.reward_amount);
      } catch {
        /* ignore malformed */
      }
    }

    const slice = byMat.get(key) || { quantityKg: 0, co2Kg: 0, declarations: 0 };
    slice.quantityKg += kg;
    slice.co2Kg += co2;
    slice.declarations += 1;
    byMat.set(key, slice);

    const processed = row.processed_at || row.created_at;
    const d = new Date(processed);
    if (!Number.isNaN(d.getTime())) {
      const week = isoWeekKey(d);
      const month = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
      bumpSeries(weeklyMap, week, kg, co2);
      bumpSeries(monthlyMap, month, kg, co2);
    }

    if (includeTop && row.user_id) {
      const u = byUser.get(row.user_id) || {
        userId: row.user_id,
        fullName: row.full_name || "—",
        email: row.email || "—",
        quantityKg: 0,
        co2Kg: 0,
        declarations: 0
      };
      u.quantityKg += kg;
      u.co2Kg += co2;
      u.declarations += 1;
      byUser.set(row.user_id, u);
    }
  }

  const byMaterial: ImpactMaterialSlice[] = [...byMat.entries()]
    .map(([materialKey, v]) => ({
      materialKey,
      label: MATERIAL_LABELS[materialKey] || materialKey,
      quantityKg: round2(v.quantityKg),
      co2Kg: round2(v.co2Kg),
      declarations: v.declarations,
      percentOfTotalKg: totalKg > 0 ? round2((v.quantityKg / totalKg) * 100) : 0
    }))
    .sort((a, b) => b.quantityKg - a.quantityKg);

  const recent: ImpactHistoryItem[] = rows
    .slice()
    .sort((a, b) => {
      const ta = new Date(a.processed_at || a.created_at).getTime();
      const tb = new Date(b.processed_at || b.created_at).getTime();
      return tb - ta;
    })
    .slice(0, 12)
    .map((row) => {
      const kg = toKg(row.quantity);
      const key = normalizeMaterial(row.material);
      return {
        id: row.id,
        material: row.material,
        materialKey: key,
        quantityKg: round2(kg),
        co2Kg: co2ForMaterialKg(row.material, kg),
        rewardEco: row.reward_amount ? weiToEcoString(BigInt(row.reward_amount)) : null,
        processedAt: row.processed_at ? new Date(row.processed_at).toISOString() : null,
        createdAt: new Date(row.created_at).toISOString(),
        txHash: row.tx_hash
      };
    });

  const equiv = deriveEquivalents(totalCo2);
  const topContributors = includeTop
    ? [...byUser.values()]
        .map((u) => ({
          ...u,
          quantityKg: round2(u.quantityKg),
          co2Kg: round2(u.co2Kg)
        }))
        .sort((a, b) => b.co2Kg - a.co2Kg)
        .slice(0, 5)
    : undefined;

  return {
    scope,
    totals: {
      quantityKg: round2(totalKg),
      co2Kg: round2(totalCo2),
      approvedDeclarations: rows.length,
      ecoRewarded: weiToEcoString(totalRewardWei),
      treesEquivalent: equiv.treesEquivalent,
      carKmEquivalent: equiv.carKmEquivalent
    },
    byMaterial,
    weekly: takeLastSorted(weeklyMap, 8),
    monthly: takeLastSorted(monthlyMap, 6),
    recent,
    topContributors,
    methodology: {
      onlyApproved: true,
      co2FactorsKgPerKg: { ...CO2_KG_PER_MATERIAL_KG },
      treesNote: `1 arbre ≈ ${KG_CO2_PER_TREE_YEAR} kg CO₂/an (ordre de grandeur pédagogique)`,
      carNote: `1 km voiture ≈ ${KG_CO2_PER_CAR_KM} kg CO₂ (ordre de grandeur pédagogique)`
    }
  };
}

function bumpSeries(map: Map<string, ImpactSeriesPoint>, period: string, kg: number, co2: number) {
  const cur = map.get(period) || { period, quantityKg: 0, co2Kg: 0, declarations: 0 };
  cur.quantityKg = round2(cur.quantityKg + kg);
  cur.co2Kg = round2(cur.co2Kg + co2);
  cur.declarations += 1;
  map.set(period, cur);
}

function takeLastSorted(map: Map<string, ImpactSeriesPoint>, n: number): ImpactSeriesPoint[] {
  return [...map.values()].sort((a, b) => a.period.localeCompare(b.period)).slice(-n);
}

/** ISO week key YYYY-Www (UTC). */
export function isoWeekKey(d: Date): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export async function getUserImpact(userId: string, db: Pool = defaultPool): Promise<ImpactDashboard> {
  const r = await db.query(
    `SELECT id, user_id, material, quantity::text AS quantity, reward_amount, tx_hash, processed_at, created_at
     FROM declarations
     WHERE user_id=$1 AND status='APPROVED'
     ORDER BY COALESCE(processed_at, created_at) DESC`,
    [userId]
  );
  return buildFromRows(r.rows as DeclRow[], "user", false);
}

export async function getPlatformImpact(db: Pool = defaultPool): Promise<ImpactDashboard> {
  const r = await db.query(
    `SELECT d.id, d.user_id, d.material, d.quantity::text AS quantity, d.reward_amount, d.tx_hash,
            d.processed_at, d.created_at, u.full_name, u.email
     FROM declarations d
     JOIN users u ON u.id = d.user_id
     WHERE d.status='APPROVED'
     ORDER BY COALESCE(d.processed_at, d.created_at) DESC`
  );
  return buildFromRows(r.rows as DeclRow[], "platform", true);
}
