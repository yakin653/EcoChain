"""
EcoChain local AI service — Trash Classifier V2 (FastAI ResNet50).

Security:
- Loads ONLY a model file that we downloaded into ./models/ (fixed path).
- Verifies SHA-256 against the hash written by download_model.py.
- Accepts only JPEG/PNG by magic bytes; size capped.
- NEVER approves declarations or mints tokens — analysis only.
"""

from __future__ import annotations

import hashlib
import io
import os
import platform
import pathlib
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from material_mapping import (
    DEFAULT_CONFIDENCE_THRESHOLD,
    compute_consistency,
    map_model_label,
    normalize_declared,
)

# FastAI pickle may embed PosixPath from Linux training — allow load on Windows.
if platform.system() == "Windows":
    pathlib.PosixPath = pathlib.WindowsPath  # type: ignore[attr-defined,misc]

MODEL_DIR = pathlib.Path(__file__).resolve().parent / "models"
MODEL_PATH = MODEL_DIR / "waste_classifier_v2.pkl"
HASH_PATH = MODEL_DIR / "waste_classifier_v2.sha256"
MAX_UPLOAD_BYTES = int(os.getenv("AI_MAX_UPLOAD_BYTES", str(5 * 1024 * 1024)))
CONFIDENCE_THRESHOLD = float(os.getenv("AI_CONFIDENCE_THRESHOLD", str(DEFAULT_CONFIDENCE_THRESHOLD)))
ALLOWED_ORIGINS = [
    o.strip()
    for o in os.getenv("AI_CORS_ORIGINS", "http://localhost:4001,http://127.0.0.1:4001").split(",")
    if o.strip()
]

_learner: Any = None
_model_ready = False
_model_error: str | None = "Model not loaded yet"


def _sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _sha256_file(path: pathlib.Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def _verify_image_magic(data: bytes) -> str:
    """Return 'jpeg' | 'png' or raise."""
    if len(data) < 12:
        raise HTTPException(status_code=400, detail="Fichier image trop petit ou vide")
    if data[:3] == b"\xff\xd8\xff":
        return "jpeg"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "png"
    raise HTTPException(
        status_code=400,
        detail="Type de fichier refusé : seuls JPEG et PNG sont acceptés (vérification magic bytes)",
    )


def _load_model() -> None:
    global _learner, _model_ready, _model_error

    if not MODEL_PATH.is_file():
        _model_ready = False
        _model_error = (
            f"Poids absents : {MODEL_PATH}. Exécutez `python download_model.py` dans ai-service/."
        )
        return

    if HASH_PATH.is_file():
        expected = HASH_PATH.read_text(encoding="utf-8").strip().split()[0]
        actual = _sha256_file(MODEL_PATH)
        if actual.lower() != expected.lower():
            _model_ready = False
            _model_error = (
                "Intégrité du modèle compromise : SHA-256 différent du hash enregistré "
                f"au téléchargement (expected={expected[:12]}… actual={actual[:12]}…)."
            )
            _learner = None
            return
    else:
        # Soft warning: still load but record that hash was missing
        print("[warn] waste_classifier_v2.sha256 manquant — relancez download_model.py")

    try:
        import os

        # Mitigate Windows/OpenMP crashes during Torch ops.
        os.environ.setdefault("KMP_DUPLICATE_LIB_OK", "TRUE")
        os.environ.setdefault("OMP_NUM_THREADS", "1")

        import torch
        from fastai.vision.all import load_learner  # lazy import

        torch.set_num_threads(1)

        # Restrict load to our known local file only (never remote URL / user path).
        resolved = MODEL_PATH.resolve()
        if not str(resolved).startswith(str(MODEL_DIR.resolve())):
            raise RuntimeError("Chemin modèle hors du dossier models/ autorisé")
        # cpu=True avoids device surprises; learn.predict() is avoided on Windows
        # (native crash observed) — we use a manual after_item/after_batch/forward path.
        _learner = load_learner(resolved, cpu=True)
        _learner.model.cpu().eval()
        _model_ready = True
        _model_error = None
        print(f"[ai] Model loaded from {resolved}")
    except Exception as exc:  # noqa: BLE001 — surface load errors to /health
        _learner = None
        _model_ready = False
        _model_error = f"Échec chargement modèle: {exc}"
        print(f"[ai] {_model_error}")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    _load_model()
    yield


app = FastAPI(
    title="EcoChain AI Waste Recognition",
    version="1.0.0",
    description="Local Trash Classifier V2 — assistive analysis only, never approves rewards.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


class DetectedObject(BaseModel):
    label: str
    ecochain_material: str
    confidence: float


class AnalyzeResponse(BaseModel):
    detected_material: str
    confidence: float
    declared_material: str
    declared_material_key: str
    consistency: str = Field(description="MATCH | MISMATCH | UNCERTAIN | DEGRADED")
    admin_review_required: bool = True
    detected_objects: list[DetectedObject]
    explanation: str
    model: str = "trash_classifier_v2"
    all_scores: dict[str, float]
    image_sha256: str
    image_format: str


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "status": "ok" if _model_ready else "degraded",
        "model": "trash_classifier_v2",
        "model_ready": _model_ready,
        "model_error": _model_error,
        "confidence_threshold": CONFIDENCE_THRESHOLD,
        "max_upload_bytes": MAX_UPLOAD_BYTES,
        "admin_review_required": True,
        "never_approves": True,
        "never_mints": True,
    }


@app.post("/analyze", response_model=AnalyzeResponse)
async def analyze(
    image: UploadFile = File(...),
    declared_material: str = Form(...),
) -> AnalyzeResponse:
    if not declared_material or not declared_material.strip():
        raise HTTPException(status_code=400, detail="declared_material requis")

    raw = await image.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Image vide")
    if len(raw) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"Image trop volumineuse (max {MAX_UPLOAD_BYTES} octets)",
        )

    image_format = _verify_image_magic(raw)
    image_sha256 = _sha256_bytes(raw)
    declared_key = normalize_declared(declared_material)

    if not _model_ready or _learner is None:
        return AnalyzeResponse(
            detected_material="unknown",
            confidence=0.0,
            declared_material=declared_material.strip(),
            declared_material_key=declared_key,
            consistency="DEGRADED",
            admin_review_required=True,
            detected_objects=[],
            explanation=(
                "Service IA en mode dégradé : modèle non chargé. "
                f"{_model_error or ''} La déclaration reste PENDING — validation humaine obligatoire."
            ),
            all_scores={},
            image_sha256=image_sha256,
            image_format=image_format,
        )

    try:
        import torch
        from fastai.vision.all import PILImage
        from PIL import Image

        pil = Image.open(io.BytesIO(raw)).convert("RGB")
        img = PILImage.create(pil)

        # Windows-safe path: avoid learn.predict() / DataLoader (observed native crashes).
        item = _learner.dls.after_item(img)
        batch = _learner.dls.after_batch(item.unsqueeze(0).cpu())
        with torch.inference_mode():
            logits = _learner.model(batch)
            probs_t = torch.softmax(logits.float(), dim=-1)[0]

        vocab = list(getattr(_learner.dls, "vocab", []))
        pred_idx = int(torch.argmax(probs_t).item())
        pred_label = str(vocab[pred_idx]) if vocab else "unknown"
        confidence = float(probs_t[pred_idx].item())

        all_scores: dict[str, float] = {}
        for i, name in enumerate(vocab):
            try:
                all_scores[str(name)] = float(probs_t[i].item())
            except Exception:  # noqa: BLE001
                continue

        detected_ecochain = map_model_label(pred_label)
        consistency, reason = compute_consistency(
            declared_material, detected_ecochain, confidence, CONFIDENCE_THRESHOLD
        )

        explanation = (
            f"Trash Classifier V2 (ResNet50/FastAI) prédit « {pred_label} » "
            f"(clé EcoChain: {detected_ecochain}) avec confiance {confidence:.1%}. {reason} "
            "L'IA n'approuve jamais une déclaration et ne distribue aucun token ECO."
        )

        return AnalyzeResponse(
            detected_material=detected_ecochain,
            confidence=round(confidence, 6),
            declared_material=declared_material.strip(),
            declared_material_key=declared_key,
            consistency=consistency,
            admin_review_required=True,
            detected_objects=[
                DetectedObject(
                    label=pred_label,
                    ecochain_material=detected_ecochain,
                    confidence=round(confidence, 6),
                )
            ],
            explanation=explanation,
            all_scores={k: round(v, 6) for k, v in all_scores.items()},
            image_sha256=image_sha256,
            image_format=image_format,
        )
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        return AnalyzeResponse(
            detected_material="unknown",
            confidence=0.0,
            declared_material=declared_material.strip(),
            declared_material_key=declared_key,
            consistency="DEGRADED",
            admin_review_required=True,
            detected_objects=[],
            explanation=(
                f"Erreur d'inférence IA: {exc}. Mode DEGRADED — validation humaine obligatoire."
            ),
            all_scores={},
            image_sha256=image_sha256,
            image_format=image_format,
        )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app:app", host="127.0.0.1", port=int(os.getenv("AI_PORT", "5001")), reload=False)
