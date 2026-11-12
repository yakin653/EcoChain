"""Download Trash Classifier V2 weights locally from Hugging Face (no API key)."""

from __future__ import annotations

import hashlib
import sys
from pathlib import Path

from huggingface_hub import hf_hub_download

REPO_ID = "C0mpl1cated3/trash_classifier_v2"
FILENAME = "waste_classifier_v2.pkl"
MODELS_DIR = Path(__file__).resolve().parent / "models"


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def main() -> int:
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    print(f"Downloading {FILENAME} from {REPO_ID} …")
    path = hf_hub_download(
        repo_id=REPO_ID,
        filename=FILENAME,
        local_dir=str(MODELS_DIR),
        local_dir_use_symlinks=False,
    )
    dest = Path(path)
    digest = sha256_file(dest)
    print(f"OK → {dest}")
    print(f"size_bytes={dest.stat().st_size}")
    print(f"sha256={digest}")
    # Persist hash for runtime integrity check
    (MODELS_DIR / "waste_classifier_v2.sha256").write_text(digest + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
