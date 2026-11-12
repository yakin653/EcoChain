import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assertSafeImageBuffer, sha256Buffer } from "./aiWasteService";

describe("aiWasteService image guards", () => {
  it("accepts JPEG magic bytes", () => {
    const buf = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
    assert.equal(assertSafeImageBuffer(buf), "jpeg");
  });

  it("accepts PNG magic bytes", () => {
    const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
    assert.equal(assertSafeImageBuffer(buf), "png");
  });

  it("rejects non-image buffers", () => {
    assert.throws(() => assertSafeImageBuffer(Buffer.from("not-an-image!!")), /JPEG et PNG/);
  });

  it("hashes buffers with sha256", () => {
    const h = sha256Buffer(Buffer.from("eco"));
    assert.equal(h.length, 64);
    assert.match(h, /^[0-9a-f]+$/);
  });
});
