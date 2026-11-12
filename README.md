# Plateforme blockchain de suivi et de récompense du recyclage

Monorepo de démarrage : **React + Vite**, **Express + TypeScript**, **PostgreSQL**, **Solidity + Hardhat**, **Hedera Testnet (HSCS, Chain ID 296)** et proxy Gemini côté backend.

## Architecture

- `frontend/` : application web EcoChain (inscription, connexion USER/ADMIN, déclarations, MetaMask, solde ECO, file admin). Le navigateur ne reçoit jamais la clé privée opérateur Hedera ni la clé Gemini.
- `backend/` : API REST, JWT + rôles `USER` / `ADMIN`, transitions d'état atomiques, service blockchain et proxy Gemini.
- `contracts/` : `EcoToken` (ERC-20) et `RecyclingRegistry` (seul minter du token, anti-double-récompense par `declarationId`).
- `database/` : schéma PostgreSQL initial.

## États métier

`PENDING → PROCESSING → APPROVED` après confirmation on-chain.

`PENDING → REJECTED` par refus administratif.

`PROCESSING → FAILED` uniquement lorsqu'un échec est certain. Une transaction soumise dont le résultat est inconnu reste `PROCESSING` jusqu'à réconciliation. `FAILED → PROCESSING` est possible via retry.

**Règle critique :** ne jamais marquer `APPROVED` sur la seule base d'un envoi de transaction. Attendre une confirmation et vérifier l'événement / l'état du contrat.

## Démarrage local

Prérequis : Node.js 20+, npm, Docker Desktop, MetaMask.

1. Copier `.env.example` vers `backend/.env` et renseigner les variables. Ne jamais committer les clés.
2. Installer les dépendances à la racine : `npm install`.
3. Démarrer PostgreSQL : `docker compose up -d postgres`.
4. Appliquer le schéma : `psql "$DATABASE_URL" -f database/schema.sql` (ou utiliser un client PostgreSQL).
5. Compiler les contrats : `npm run compile:contracts`.
6. Démarrer l'API : `npm run dev:backend` (port **4001** par défaut, `PORT` dans `backend/.env`).
7. Démarrer React : `npm run dev:frontend` (`VITE_API_URL=http://localhost:4001/api`).
8. Vérifier la santé : `http://localhost:4001/api/health`.

## Documentation académique (grille)

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — conception Blockchain & trade-offs  
- [`docs/SECURITY.md`](docs/SECURITY.md) — contrôles SC, tests d’attaque, rate-limit  
- [`docs/JOURNAL_IA.md`](docs/JOURNAL_IA.md) — usage GenAI vérifié  
- [`docs/SOUTENANCE_QR.md`](docs/SOUTENANCE_QR.md) — fiche Q/R orale  
- [`docs/DEPLOY_HEDERA_TESTNET.md`](docs/DEPLOY_HEDERA_TESTNET.md) — deploy Testnet 296  

## Déploiement Hedera Testnet

Guide détaillé : [`docs/DEPLOY_HEDERA_TESTNET.md`](docs/DEPLOY_HEDERA_TESTNET.md).

1. Renseigner `BACKEND_OPERATOR_PRIVATE_KEY` (0x + 64 hex) dans `backend/.env` — jamais dans Git.
2. Financer l’adresse opérateur via https://portal.hedera.com/faucet (Testnet).
3. Préflight : `npm run check:hedera` → `operatorReady: true`.
4. Déployer : `npm run deploy:testnet` (écrit automatiquement `TOKEN_CONTRACT_ADDRESS` + `REGISTRY_CONTRACT_ADDRESS` dans `backend/.env`, configure `setMinter` une seule fois).
5. Ou en une commande après financement : `npm run wait-fund-deploy`.
6. Redémarrer le backend → `GET /api/health` doit afficher `chain.readyForMint: true`.
7. Smoke on-chain : `npm run smoke:reward` (1 ECO + anti-double-paiement).

**Mainnet interdit.** Le frontend lit `balanceOf` ; seul le backend opérateur signe les récompenses.

## Politique de récompense ECO (backend)

Formule (arithmétique entière uniquement, 18 décimales) :

`reward_wei = floor(quantity_kg × rate_eco_per_kg × 10^18)`

Barème par défaut (ECO/kg) : plastic 12, metal 15, aluminum 18, glass 8, paper 5, cardboard 4, organic 2, electronic 25, other 3.

- Quantité minimale : `0.1` kg (`REWARD_MIN_QUANTITY_MILLIS=100`).
- Plafond : `1000` ECO / déclaration (`REWARD_MAX_ECO_PER_DECLARATION`).
- À la **création** : `estimated_reward_amount` (informatif) ; `reward_amount` reste `NULL`.
- À la **validation ADMIN** : le backend **recalcule** et enregistre le montant **définitif** dans `reward_amount`.
- Un override ADMIN (`amountEco`) exige une **justification** (≥ 5 caractères), est plafonné à 1000 ECO, et est **historisé** dans `reward_amount_overrides`.
- Le **retry** est refusé si `reward_amount` est absent ; sinon il réutilise exactement ce montant — sans nouveau calcul.
- `APPROVED` exige une preuve complète : `isProcessed` + receipt `status=1` + événement `Rewarded` cohérent (declarationId / wallet / montant). Sinon la déclaration reste `PROCESSING`.
- L'utilisateur **ne peut jamais** imposer un montant de récompense.

## API prévue

- `POST /api/auth/register` — inscription USER.
- `POST /api/auth/login` — connexion JWT.
- `GET /api/auth/me` — profil authentifié.
- `PATCH /api/auth/wallet` — associer / mettre à jour l'adresse MetaMask du compte (`{ "walletAddress": "0x..." }`).
- `POST /api/declarations` — USER crée une déclaration (montant estimé serveur ; pas de champ reward client).
- `GET /api/declarations/mine` — USER consulte ses déclarations.
- `GET /api/declarations/admin/list?status=PENDING` — ADMIN liste les déclarations.
- `POST /api/declarations/admin/:id/reject` — ADMIN refuse une déclaration.
- `POST /api/declarations/admin/:id/validate` — ADMIN lance le traitement. Body optionnel : `{ "amountEco": "30", "justification": "..." }`.
- `POST /api/declarations/admin/:id/retry` — ADMIN relance une déclaration `FAILED`.
- `POST /api/declarations/admin/:id/reconcile` — ADMIN vérifie une déclaration restée `PROCESSING` (sans second mint).
- `GET /api/rewards/balance/:wallet` — lecture du solde ECO.
- `POST /api/assistant` — proxy Gemini côté serveur.

## Défi écologique hebdomadaire (Weekly Eco Challenge)

Migration : `psql "$DATABASE_URL" -f database/migration_weekly_eco_challenge.sql`  
(ou réappliquer `database/schema.sql` sur une base neuve).

Flux tâche : `TODO / IN_PROGRESS` → USER soumet (`SUBMITTED`) → ADMIN valide (`PROCESSING`) → mint via `RecyclingRegistry` → `COMPLETED` après preuve on-chain.  
Aucun mint au clic USER. Clé anti-double-récompense : `reward_key` / `bonus_reward_key` (même formule que `declaration_key`).

- `GET /api/challenges/current` — USER : défi actif + progression (auto-inscription).
- `POST /api/challenges/tasks/:progressId/start` — USER démarre une tâche.
- `POST /api/challenges/tasks/:progressId/complete` — USER marque terminée → `SUBMITTED` seulement.
- `GET /api/challenges/mine/history` — historique.
- `GET /api/challenges/mine/badges` — badges.
- `POST /api/challenges/admin` — ADMIN crée un défi (7 tâches par défaut).
- `PATCH /api/challenges/admin/:id` — ADMIN modifie titre / bonus / tâches.
- `GET /api/challenges/admin/list` — liste des défis.
- `GET /api/challenges/admin/submissions/list?status=SUBMITTED` — file de validation.
- `POST /api/challenges/admin/tasks/:progressId/validate|reject|retry|reconcile`
- `POST /api/challenges/admin/enrollments/:id/validate-bonus|retry-bonus|reconcile-bonus`
- `GET /api/challenges/admin/:id/progress` — progression des inscrits.

## Tests backend (étape A)

```bash
npm run test -w backend
```

## Sécurité / points à terminer avant démonstration

- Ajouter limitation de débit, journalisation et UI admin/MetaMask (étapes suivantes).
- Créer le premier ADMIN manuellement via un compte DB administrateur, par exemple `UPDATE users SET role='ADMIN' WHERE email='admin@example.com';` (ne jamais exposer cette opération dans une route publique).
- Gérer la réconciliation automatique des `PROCESSING` après redémarrage (étape B).
- Le `declarationId` on-chain est `ethers.id(uuid.toLowerCase())` (= `keccak256(utf8(uuid lowercased))`),
  implémenté de façon identique dans `backend/src/services/declarationKey.ts` et `contracts/helpers/declarationKey.ts`.
- Au démarrage de l'API, les déclarations `PROCESSING` sont réconciliées automatiquement (`RECONCILE_ON_STARTUP=true`)
  via un verrou PostgreSQL advisory : preuves on-chain uniquement, **jamais** de second mint.
- Les montants on-chain sont toujours en wei (18 décimales), calculés côté serveur.

Ce dépôt est une base de projet structurée, pas encore une application prête pour la production.
