# EcoChain AI Service — Trash Classifier V2

Service Python local (FastAPI) pour la reconnaissance de déchets.  
**Aucune API payante.** Poids téléchargés depuis Hugging Face.

## Règles de sécurité

- L'IA n'approuve **jamais** une déclaration.
- L'IA ne mint **jamais** de tokens ECO.
- Validation humaine obligatoire (`admin_review_required: true`).
- Aluminium déclaré + prédiction `metal` → `UNCERTAIN` (jamais `MATCH`).
- Modèle chargé uniquement depuis `./models/waste_classifier_v2.pkl` avec contrôle SHA-256.

## Démarrage

```powershell
cd ai-service
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
python download_model.py
python test_material_mapping.py
uvicorn app:app --host 127.0.0.1 --port 5001
```

Health : http://127.0.0.1:5001/health

## Endpoints

| Méthode | Chemin | Rôle |
|---------|--------|------|
| GET | `/health` | État du modèle |
| POST | `/analyze` | `multipart`: `image` + `declared_material` |

Consistances : `MATCH` | `MISMATCH` | `UNCERTAIN` | `DEGRADED`
