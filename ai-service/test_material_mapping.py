"""Unit tests for consistency rules (no model weights required)."""

from material_mapping import compute_consistency, map_model_label, normalize_declared


def test_normalize_and_map():
    assert normalize_declared("Plastique") == "plastic"
    assert normalize_declared("Aluminium") == "aluminum"
    assert map_model_label("e-waste") == "electronic"
    assert map_model_label("plastic") == "plastic"


def test_match_plastic():
    c, _ = compute_consistency("plastic", "plastic", 0.94)
    assert c == "MATCH"


def test_mismatch():
    c, _ = compute_consistency("glass", "plastic", 0.90)
    assert c == "MISMATCH"


def test_uncertain_low_confidence():
    c, _ = compute_consistency("plastic", "plastic", 0.40)
    assert c == "UNCERTAIN"


def test_aluminum_vs_metal_never_match():
    c, msg = compute_consistency("aluminum", "metal", 0.95)
    assert c == "UNCERTAIN"
    assert "aluminium" in msg.lower() or "aluminum" in msg.lower() or "metal" in msg.lower()


def test_aluminum_vs_plastic_mismatch():
    c, _ = compute_consistency("aluminium", "plastic", 0.90)
    assert c == "MISMATCH"


if __name__ == "__main__":
    test_normalize_and_map()
    test_match_plastic()
    test_mismatch()
    test_uncertain_low_confidence()
    test_aluminum_vs_metal_never_match()
    test_aluminum_vs_plastic_mismatch()
    print("OK — all material_mapping tests passed")
