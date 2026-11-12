# Reconnaissance de déchets — Trash Classifier V2 (local)

## Décision

Modèle retenu : [`C0mpl1cated3/trash_classifier_v2`](https://huggingface.co/C0mpl1cated3/trash_classifier_v2) (MIT, ResNet50/FastAI, ~98 Mo).

Aucune API payante. Poids téléchargés localement via `ai-service/download_model.py`.

## Règles métier / sécurité

- L’IA **n’approuve jamais** une déclaration (statut reste `PENDING`).
- L’IA **ne mint jamais** de tokens ECO (`processReward` / contrats inchangés).
- `admin_review_required` est toujours `true`.
- Consistances : `MATCH` | `MISMATCH` | `UNCERTAIN` | `DEGRADED`.
- Aluminium déclaré + prédiction `metal` → **UNCERTAIN** (jamais MATCH).
- Uploads : JPEG/PNG uniquement (magic bytes), max 5 Mo, SHA-256, stockage hors web root.
- Modèle : chemin fixe `ai-service/models/`, contrôle SHA-256 post-téléchargement.

## Démarrage

```powershell
# Terminal 1 — AI
cd ai-service
.\.venv\Scripts\activate
$env:KMP_DUPLICATE_LIB_OK='TRUE'
uvicorn app:app --host 127.0.0.1 --port 5001

# Terminal 2 — API (déjà habituelle)
npm run dev:backend

# Terminal 3 — Frontend
npm run dev:frontend
```

Migration : `database/migration_ai_waste_recognition.sql`

## Note Windows

`learn.predict()` provoquait un crash natif ; l’inférence utilise un forward manuel (`after_item` → `after_batch` → `model`).
