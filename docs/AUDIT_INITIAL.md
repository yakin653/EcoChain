# Audit initial — EcoChain (avant extension)

Date : 12 novembre 2026 · Auditeur : ingénieur senior (agent autonome) · Baseline commit : `45854aa`

## 1. Périmètre relu intégralement

- `contracts/` : `EcoToken.sol`, `RecyclingRegistry.sol`, `hardhat.config.ts`, `helpers/declarationKey.ts`, `scripts/deploy.ts`, `scripts/checkHedera.ts`, `test/RecyclingRegistry.ts`.
- `backend/src/` : `app.ts`, `server.ts`, `config/env.ts`, `db/pool.ts`, `middleware/{auth,errors}.ts`, `routes/{auth,declarations,challenges,rewards,assistant}.ts`, `services/{blockchainService,chainReadiness,rewardPolicy,rewardService,challengeService,challengeRewardService,challengeDefaults,declarationKey,startupReconcile}.ts` + 6 fichiers de tests.
- `frontend/src/` : `App.tsx`, `WeeklyChallenge.tsx`, `wallet.ts`, `api.ts`, `types.ts`, `style.css`.
- `database/` : `schema.sql` (10 tables) + 3 migrations. `scripts/normalize-operator-key.mjs`, `docker-compose.yml`, `.env.example`, `README.md`.

## 2. État de santé mesuré (baseline, avant tout changement)

| Contrôle | Résultat |
|---|---|
| `npm run test -w backend` (node:test) | ✅ 34/34 tests passent |
| `npm run compile:contracts` (solc 0.8.24) | ✅ 8 fichiers compilés |
| API `GET /api/health` | ✅ 200, `readyForMint:false` (contrats non déployés — attendu) |
| Frontend `npm run build -w frontend` | ✅ tsc + vite OK |
| PostgreSQL (docker, port 5433) | ✅ healthy, schéma appliqué (10 tables) |
| Slither | ❌ non installé sur la machine |
| Foundry (forge) | ❌ non installé sur la machine |
| solidity-coverage / gas-reporter | ❌ non configurés dans `contracts/` |

## 3. Ce qui est déjà solide (à ne pas casser)

1. **Anti-double-paiement à 3 niveaux** : `declaration_key` UNIQUE en DB, `declarationId = keccak256(uuid minuscule)` identique backend/contrats, mapping `processedDeclarations` on-chain.
2. **Machine à états prudente** (`rewardService.ts`) : `APPROVED` exige 3 preuves concordantes (`isProcessed` + receipt `status=1` + événement `Rewarded` cohérent wallet/montant/tx). Résultat inconnu ⇒ reste `PROCESSING`, jamais de second mint. Réconciliation au démarrage avec verrou advisory PostgreSQL (`startupReconcile.ts`).
3. **Argent calculé côté serveur uniquement**, en `BigInt`/wei (18 décimales), barème par matière, min 0,1 kg, plafond 1000 ECO, override admin avec justification ≥ 5 caractères historisée (`reward_amount_overrides`).
4. **Auth** : bcrypt (coût 12), JWT 1 jour, rôles `USER`/`ADMIN` via `requireRole`, validation Zod partout, helmet, CORS restreint à `FRONTEND_ORIGIN`, JSON limité à 1 Mo.
5. **Clés privées** : jamais côté frontend ; `chainReadiness.ts` rejette les placeholders ; `checkHedera.ts` fait un pré-vol sans jamais imprimer la clé.
6. **Tests existants ciblés** sur la logique critique (politique de récompense, orchestration des statuts avec chaîne mockée, anti-remint au reboot).

## 4. Faiblesses et manques identifiés (par sévérité)

### Contrats (critères 1 & 2 de la grille)
- **F1 — Contrôle d'accès pauvre** : `EcoToken` = `Ownable` seul, mint réservé par un `minter` one-shot en chaîne de caractères (`require` avec strings, pas de custom errors). Aucun rôle VALIDATOR/PAUSER, pas de `Pausable`, pas de `burn`.
- **F2 — Pas de flux voucher EIP-712** : seul le backend peut appeler `RecyclingRegistry.reward()` (`onlyOwner`). L'utilisateur ne peut pas réclamer lui-même sa récompense avec une autorisation signée ; la clé opérateur est un point de défaillance unique et « chaude ».
- **F3 — Aucun plafond** de mint (ni par utilisateur, ni journalier, ni global), aucun `ReentrancyGuard` explicite (le risque est faible aujourd'hui car mint interne, mais non démontré par un test d'attaque).
- **F4 — Fonctionnalités absentes** : pas de taux on-chain (`RewardRates` vit en dur côté backend), pas de badges NFT soulbound (les badges sont de simples lignes SQL), pas de registre d'impact CO2, pas d'ancrage de preuve photo, pas de marketplace, pas de gouvernance.
- **F5 — Tests contrats minces** : un seul fichier (11 tests) sur `RecyclingRegistry` ; pas de tests d'attaque, pas de couverture mesurée, pas de rapport de gaz, pas de fuzzing, pas d'analyse statique.

### Backend (critère 2 & 4)
- **F6 — Pas de rate limiting** : `/api/auth/login` est exposé au brute-force ; aucun limiteur global.
- **F7 — Pas d'upload ni de preuve photo** : une déclaration est purement déclarative ; aucun hash SHA-256 ancré, aucune analyse d'image. Gemini n'est utilisé qu'en chat texte (`routes/assistant.ts`), pas en Vision.
- **F8 — Health pauvre** : `/api/health` ne connaît que les 2 contrats legacy ; pas d'état par contrat ni de liste de blocages pour les nouveaux modules.
- **F9 — Pas de logs d'audit** structurés des actions sensibles (validations, overrides) au-delà de la table d'overrides.
- **F10 — Nouveaux flux absents** : pas de production de voucher EIP-712, pas d'ancrage ProofRegistry, pas d'impact CO2, pas de badge NFT, pas de marketplace.

### Frontend (critère 1 & 4)
- **F11 — Assistant IA invisible** : la route `/api/assistant` existe mais **aucun écran de chat** dans `App.tsx`.
- **F12 — Vues manquantes** : impact CO2, galerie de badges NFT (les badges SQL sont affichés en texte simple), marketplace, gouvernance, vue « preuve publique » (seul un lien HashScan par déclaration existe), envoi de photo avec score IA.
- **F13 — JWT en `localStorage`** : risque XSS classique (accepté pour la démo, documenté dans `docs/LIMITES.md`).

### Transverse
- **F14 — Documentation de soutenance absente** : pas de `docs/` (décisions, menaces, Q&R oral, journal IA, script de démo).
- **F15 — Déploiement** : `deploy.ts` ne déploie que 2 contrats, n'écrit aucune config partagée avec le backend, ne traite pas `readyForMint`.

## 5. Décisions d'audit (détaillées dans `docs/DECISIONS.md`)

1. **Compatibilité d'abord** : `RecyclingRegistry` et le flux backend actuel restent fonctionnels tels quels (regression tests inchangés). `EcoToken` est étendu (AccessControl + Pausable + burn + custom errors) **en gardant** `minter`/`setMinter`/`mint` legacy pour ne pas casser `RecyclingRegistry` ni les tests existants.
2. Le nouveau flux voucher EIP-712 (`RewardDistributor`) est **additif** : le backend continue de valider en admin, mais au lieu d'être le seul à pouvoir payer, il produit un voucher signé que l'utilisateur (ou le backend en relais) soumet à `claim()`.
3. Foundry et Slither absents de la machine : fuzzing via Hardhat (valeurs aléatoires déterministes seedées), Slither installé via pip si possible sinon findings simulés par relecture + documentés comme tels.
4. Gouvernance volontairement simple et honnête : vote pondéré par solde ECO (snapshot au moment de la création), timelock maison testé, exécution qui met à jour `RewardRates` — pas de fausse DAO complète.

## 6. Plan d'exécution

Étapes 1→6 du brief, chacune terminée par : compilation, tests, et un commit logique. Critères d'acceptation vérifiés à l'étape finale (voir todo du dépôt).
