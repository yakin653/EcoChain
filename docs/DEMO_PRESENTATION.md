# EcoChain — Script de présentation pratique (8–10 min)

**Histoire :** recyclage vérifié par la communauté → ancré de façon infalsifiable → récompensé par un arbre vivant (+ ECO on-chain).

## URLs

| Service | URL |
|---|---|
| Frontend | http://localhost:5173/ |
| API health | http://localhost:4001/api/health → `readyForMint: true` |
| AI health | http://127.0.0.1:5001/health → `model_ready: true` |

## Comptes démo

| Rôle | Email | Mot de passe |
|------|-------|--------------|
| USER | `user@ecochain.local` | `DemoUser123!` |
| ADMIN | `admin@ecochain.local` | `DemoAdmin123!` |
| VALIDATOR | promouvoir via `POST /api/admin/users/:id/role` | — |

MetaMask : réseau **Hedera Testnet** · Chain ID **296** · RPC `https://testnet.hashio.io/api`

## Check 30 secondes avant le jury

```powershell
curl http://localhost:4001/api/health
curl http://127.0.0.1:5001/health
```

Badge UI : **Hedera 296 · mint READY**

## Déroulé

1. **Auth USER** — branding EcoChain, Hedera 296.  
2. **Portefeuille + ECO** — solde, ledger, badge mint READY.  
3. **ECO IMPACT** — kg, CO₂, arbres/km (APPROVED only).  
4. **EcoTree** — niveau / progression ; « Faire germer » si besoin.  
5. **Nouvelle déclaration** (+ photo) → si IA incertaine → `COMMUNITY_REVIEW`, sinon `PENDING`.  
6. **ADMIN** — promouvoir un VALIDATOR si besoin ; ou « Envoyer à la communauté ».  
7. **VALIDATOR** — onglet Validation : photo, verdict IA, Approuver/Refuser (montrer 2/3).  
8. **Preuve mint** — `APPROVED`, HashScan tx, solde ECO.  
9. **Journal HCS** — ADMIN « Ancrer la semaine » → Vérifier (vert). Topic HashScan.  
10. **Honneteté** — anti-double-pay, facteurs CO₂ pédagogiques, HCS/NFT n’annulent jamais un mint.

## Si un service est down

```powershell
docker start recycling-postgres
cd ai-service
$env:KMP_DUPLICATE_LIB_OK='TRUE'
.\.venv\Scripts\python.exe -m uvicorn app:app --host 127.0.0.1 --port 5001
npm run dev:backend
npm run dev:frontend
```

## Contrats / topics

Adresses EVM + `HCS_TOPIC_ID` / `TREE_TOKEN_ID` dans `backend/.env` — jamais les clés.
