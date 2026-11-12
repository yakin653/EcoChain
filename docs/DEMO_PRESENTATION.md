# EcoChain — Script de présentation (prêt)

## URLs

- Frontend : http://localhost:5173/
- API health : http://localhost:4001/api/health
- AI health : http://127.0.0.1:5001/health

## Comptes démo

| Rôle | Email | Mot de passe |
|------|-------|--------------|
| USER | `user@ecochain.local` | `DemoUser123!` |
| ADMIN | `admin@ecochain.local` | `DemoAdmin123!` |

## Déroulé 8–10 min

1. **Page d’accueil** — branding EcoChain, Hedera Testnet 296, split-screen.
2. **Connexion USER** — montrer l’espace citoyen.
3. **Nouvelle déclaration** — matière + kg + **photo** → statut `PENDING` + analyse IA (MATCH / MISMATCH / UNCERTAIN).
4. **Préciser** : l’IA n’approuve jamais et ne mint jamais.
5. **Déconnexion → ADMIN** — file des déclarations, panneau IA, Valider / Refuser (humain).
6. **Défi hebdomadaire** — tâches 7 jours (si défi actif).
7. **Honneteté** : mint on-chain désactivé tant que les contrats Hedera ne sont pas déployés (`readyForMint: false`). L’UI et la validation admin fonctionnent ; le paiement tokens attend les clés/adresses.

## Si un service est down

```powershell
# Postgres
docker start recycling-postgres

# AI
cd ai-service
.\.venv\Scripts\activate
$env:KMP_DUPLICATE_LIB_OK='TRUE'
uvicorn app:app --host 127.0.0.1 --port 5001

# Backend / Frontend (racine monorepo)
npm run dev:backend
npm run dev:frontend
```
