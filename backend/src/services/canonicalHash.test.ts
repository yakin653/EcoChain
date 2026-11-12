import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canonicalize, hashCanonicalPayload } from "./canonicalHash";

describe("canonicalHash", () => {
  it("sorts object keys deterministically", () => {
    const a = canonicalize({ b: 1, a: 2, nested: { z: 1, a: 0 } });
    const b = canonicalize({ a: 2, nested: { a: 0, z: 1 }, b: 1 });
    assert.equal(a, b);
    assert.equal(a, '{"a":2,"b":1,"nested":{"a":0,"z":1}}');
  });

  it("produces stable SHA-256 for same logical payload", () => {
    const h1 = hashCanonicalPayload({ week: "2026-W45", co2Kg: 3, quantityKg: 2 });
    const h2 = hashCanonicalPayload({ quantityKg: 2, co2Kg: 3, week: "2026-W45" });
    assert.equal(h1, h2);
    assert.match(h1, /^[a-f0-9]{64}$/);
  });

  it("changes hash when payload changes", () => {
    const h1 = hashCanonicalPayload({ co2Kg: 1 });
    const h2 = hashCanonicalPayload({ co2Kg: 2 });
    assert.notEqual(h1, h2);
  });
});
