import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { levelFromCo2Kg, nextLevelInfo } from "./treeLevels";

describe("treeLevels", () => {
  it("maps CO2 thresholds to levels", () => {
    assert.equal(levelFromCo2Kg(0), "seed");
    assert.equal(levelFromCo2Kg(0.9), "seed");
    assert.equal(levelFromCo2Kg(1), "sprout");
    assert.equal(levelFromCo2Kg(10), "sapling");
    assert.equal(levelFromCo2Kg(50), "tree");
    assert.equal(levelFromCo2Kg(200), "forest");
    assert.equal(levelFromCo2Kg(999), "forest");
  });

  it("computes progress toward next level", () => {
    const p = nextLevelInfo(5);
    assert.equal(p.current, "sprout");
    assert.equal(p.next, "sapling");
    assert.equal(p.nextMinCo2Kg, 10);
    assert.ok(p.progress01 > 0 && p.progress01 < 1);
  });
});
