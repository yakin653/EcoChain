import { createHash } from "crypto";

/**
 * Deterministic JSON: recursively sort object keys, then SHA-256 hex digest.
 * Never include PII — callers must pass hashes / aggregates only.
 */
export function canonicalize(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(sortKeys);
  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    out[key] = sortKeys(obj[key]);
  }
  return out;
}

export function sha256Hex(input: string | Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}

/** Canonical JSON → SHA-256 hex (lowercase). */
export function hashCanonicalPayload(payload: unknown): string {
  return sha256Hex(canonicalize(payload));
}
