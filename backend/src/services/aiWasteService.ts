/**
 * Client for the local Trash Classifier V2 service.
 * Assistive only — never approves declarations or triggers mint.
 */

import { createHash } from "crypto";
import { env } from "../config/env";

export type AiConsistency = "MATCH" | "MISMATCH" | "UNCERTAIN" | "DEGRADED";

export type AiAnalysisResult = {
  detected_material: string;
  confidence: number;
  declared_material: string;
  declared_material_key: string;
  consistency: AiConsistency;
  admin_review_required: true;
  detected_objects: Array<{ label: string; ecochain_material: string; confidence: number }>;
  explanation: string;
  model: string;
  all_scores: Record<string, number>;
  image_sha256: string;
  image_format: string;
};

const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff]);
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function assertSafeImageBuffer(buf: Buffer): "jpeg" | "png" {
  if (buf.length < 12) {
    throw Object.assign(new Error("Image trop petite ou vide"), { statusCode: 400 });
  }
  if (buf.subarray(0, 3).equals(JPEG_MAGIC)) return "jpeg";
  if (buf.subarray(0, 8).equals(PNG_MAGIC)) return "png";
  throw Object.assign(new Error("Seuls JPEG et PNG sont acceptés (magic bytes)"), { statusCode: 400 });
}

export function sha256Buffer(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

export async function probeAiHealth(): Promise<{
  reachable: boolean;
  modelReady: boolean;
  detail: unknown;
}> {
  try {
    const res = await fetch(`${env.aiServiceUrl}/health`, { signal: AbortSignal.timeout(3000) });
    const detail = await res.json().catch(() => ({}));
    return {
      reachable: res.ok,
      modelReady: Boolean((detail as { model_ready?: boolean }).model_ready),
      detail
    };
  } catch (error) {
    return { reachable: false, modelReady: false, detail: { error: String(error) } };
  }
}

/**
 * Call local AI /analyze. On network/model failure returns DEGRADED — never throws for AI downtime.
 */
export async function analyzeWastePhoto(
  image: Buffer,
  declaredMaterial: string,
  filename = "upload.jpg"
): Promise<AiAnalysisResult> {
  const format = assertSafeImageBuffer(image);
  const imageSha = sha256Buffer(image);

  if (image.length > env.aiMaxUploadBytes) {
    throw Object.assign(new Error(`Image trop volumineuse (max ${env.aiMaxUploadBytes} octets)`), {
      statusCode: 413
    });
  }

  try {
    const form = new FormData();
    const blob = new Blob([new Uint8Array(image)], {
      type: format === "jpeg" ? "image/jpeg" : "image/png"
    });
    form.append("image", blob, filename);
    form.append("declared_material", declaredMaterial);

    const res = await fetch(`${env.aiServiceUrl}/analyze`, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(env.aiTimeoutMs)
    });

    if (!res.ok) {
      const text = await res.text();
      return degraded(declaredMaterial, imageSha, format, `AI HTTP ${res.status}: ${text.slice(0, 200)}`);
    }

    const data = (await res.json()) as AiAnalysisResult;
    // Hard guarantee: admin review always required; never trust a false from upstream
    return {
      ...data,
      admin_review_required: true,
      consistency: normalizeConsistency(data.consistency),
      image_sha256: data.image_sha256 || imageSha,
      image_format: data.image_format || format
    };
  } catch (error) {
    return degraded(
      declaredMaterial,
      imageSha,
      format,
      `Service IA injoignable (${env.aiServiceUrl}): ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

function normalizeConsistency(value: string | undefined): AiConsistency {
  if (value === "MATCH" || value === "MISMATCH" || value === "UNCERTAIN" || value === "DEGRADED") {
    return value;
  }
  return "DEGRADED";
}

function degraded(
  declaredMaterial: string,
  imageSha: string,
  format: string,
  reason: string
): AiAnalysisResult {
  return {
    detected_material: "unknown",
    confidence: 0,
    declared_material: declaredMaterial,
    declared_material_key: declaredMaterial.trim().toLowerCase(),
    consistency: "DEGRADED",
    admin_review_required: true,
    detected_objects: [],
    explanation: `${reason}. Mode DEGRADED — validation humaine obligatoire. Aucun mint automatique.`,
    model: "trash_classifier_v2",
    all_scores: {},
    image_sha256: imageSha,
    image_format: format
  };
}
