"""Map Trash Classifier V2 labels to EcoChain material keys + consistency rules."""

from __future__ import annotations

# Model output label → EcoChain material key (rewardPolicy.ts)
MODEL_TO_ECOCHAIN: dict[str, str] = {
    "plastic": "plastic",
    "glass": "glass",
    "metal": "metal",
    "paper": "paper",
    "cardboard": "cardboard",
    "organic": "organic",
    "e-waste": "electronic",
    "ewaste": "electronic",
    "textile": "other",
}

# Declared free-text → EcoChain key (mirrors backend aliases, lowercase)
DECLARED_ALIASES: dict[str, str] = {
    "plastic": "plastic",
    "plastique": "plastic",
    "metal": "metal",
    "métal": "metal",
    "metaux": "metal",
    "métaux": "metal",
    "aluminum": "aluminum",
    "aluminium": "aluminum",
    "glass": "glass",
    "verre": "glass",
    "paper": "paper",
    "papier": "paper",
    "cardboard": "cardboard",
    "carton": "cardboard",
    "organic": "organic",
    "organique": "organic",
    "electronic": "electronic",
    "electronique": "electronic",
    "électronique": "electronic",
    "e-waste": "electronic",
    "ewaste": "electronic",
    "other": "other",
    "autre": "other",
    "textile": "other",
    "mixed": "other",
    "mixte": "other",
}

DEFAULT_CONFIDENCE_THRESHOLD = 0.55


def normalize_declared(material: str) -> str:
    key = (material or "").strip().lower()
    return DECLARED_ALIASES.get(key, "other")


def map_model_label(label: str) -> str:
    key = (label or "").strip().lower()
    return MODEL_TO_ECOCHAIN.get(key, "other")


def compute_consistency(
    declared_material: str,
    detected_ecochain: str,
    confidence: float,
    threshold: float = DEFAULT_CONFIDENCE_THRESHOLD,
) -> tuple[str, str]:
    """
    Returns (consistency, explanation_suffix).

    Aluminum rule (requirement #7):
    A model prediction of ``metal`` must NEVER be treated as a certain
    identification of aluminum → UNCERTAIN (not MATCH).
    """
    declared = normalize_declared(declared_material)

    if confidence < threshold:
        return (
            "UNCERTAIN",
            f"Confiance {confidence:.1%} inférieure au seuil {threshold:.0%} — révision admin obligatoire.",
        )

    # Special aluminum vs metal: never auto-MATCH
    if declared == "aluminum" and detected_ecochain == "metal":
        return (
            "UNCERTAIN",
            "Le modèle prédit « metal » de façon générique ; cela ne prouve pas qu'il s'agit "
            "d'aluminium. Révision humaine obligatoire (aluminium ≠ metal certain).",
        )

    if declared == detected_ecochain:
        return (
            "MATCH",
            f"La matière déclarée ({declared}) correspond à la prédiction ({detected_ecochain}).",
        )

    # Soft related pairs that are still mismatches for reward purposes
    return (
        "MISMATCH",
        f"Écart : déclaré « {declared} », détecté « {detected_ecochain} ». "
        "Révision admin obligatoire avant toute validation.",
    )
