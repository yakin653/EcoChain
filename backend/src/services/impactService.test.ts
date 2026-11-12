import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CO2_KG_PER_MATERIAL_KG,
  co2ForMaterialKg,
  deriveEquivalents,
  isoWeekKey
} from "./impactService";

describe("impactService — factors & equivalents", () => {
  it("computes CO2 from material aliases (FR/EN)", () => {
    assert.equal(co2ForMaterialKg("Plastique", 2), round2(2 * CO2_KG_PER_MATERIAL_KG.plastic!));
    assert.equal(co2ForMaterialKg("aluminium", 1), CO2_KG_PER_MATERIAL_KG.aluminum);
    assert.equal(co2ForMaterialKg("unknown-stuff", 10), round2(10 * CO2_KG_PER_MATERIAL_KG.other!));
  });

  it("derives tree and car-km equivalents", () => {
    const e = deriveEquivalents(42);
    assert.equal(e.treesEquivalent, 2);
    assert.equal(e.carKmEquivalent, 350);
  });

  it("builds stable ISO week keys", () => {
    const key = isoWeekKey(new Date("2026-11-12T12:00:00.000Z"));
    assert.match(key, /^2026-W\d{2}$/);
  });

  it("PENDING must not be mixed into factors API — factors are pure", () => {
    // Guardrail: zero quantity yields zero impact (no phantom CO2).
    assert.equal(co2ForMaterialKg("plastic", 0), 0);
  });
});

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
