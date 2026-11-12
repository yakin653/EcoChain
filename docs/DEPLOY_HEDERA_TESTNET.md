# Déploiement Hedera Testnet (EcoChain)

Objectif : `GET /api/health` → `chain.readyForMint: true` avec mint réel de tokens ECO.

## Prérequis

- Node.js 20+, npm
- Compte opérateur ECDSA (clé privée `0x` + 64 hex) dans `backend/.env` uniquement (jamais dans Git)
- HBAR Testnet sur ce wallet (≥ ~2–5 HBAR recommandés pour deploy + quelques rewards)
- RPC : `https://testnet.hashio.io/api` — Chain ID `296`

## Variables (`backend/.env`)

| Variable | Rôle |
|---|---|
| `HEDERA_RPC_URL` | RPC Testnet Hashio |
| `HEDERA_CHAIN_ID` | `296` |
| `BACKEND_OPERATOR_PRIVATE_KEY` | Clé ECDSA opérateur (0x+64 hex) |
| `OPERATOR_EVM_ADDRESS` | Adresse dérivée (contrôle cohérence) |
| `TOKEN_CONTRACT_ADDRESS` | Rempli par `deploy:testnet` |
| `REGISTRY_CONTRACT_ADDRESS` | Rempli par `deploy:testnet` |

Voir `.env.example` (placeholders uniquement).

## Financer l’opérateur

1. Ouvrir https://portal.hedera.com/faucet (réseau **testnet**).
2. Coller `OPERATOR_EVM_ADDRESS`.
3. **Receive … testnet HBAR** → résoudre le reCAPTCHA → **Confirm**.
4. Vérifier : `npm run check:hedera` → `operatorHasHbar: true`.

Sans HBAR, le déploiement est impossible. Ne pas inventer de clé ni simuler un succès.

## Déployer

```bash
npm run compile:contracts
npm run test:contracts
npm run deploy:testnet
```

Le script `contracts/scripts/deploy.ts` :

1. Déploie `EcoToken(owner=operator)`
2. Déploie `RecyclingRegistry(token, admin=operator, maxRewardWei=1000 ECO)` — Pausable + ReentrancyGuard + plafond
3. Appelle `setMinter(registry)` **une seule fois** (irréversible)
4. Vérifie `token.minter() == registry` et `registry.owner() == operator`
5. Écrit les adresses dans `backend/.env` (désactiver avec `DEPLOY_WRITE_ENV=false`)

Contrôles d’urgence post-deploy : `registry.pause()` / `unpause()`, `lowerMaxRewardWei(newMax)` (abaissement seulement).

Attente automatique de fonds puis deploy :

```bash
npm run wait-fund-deploy -w contracts
```

## Brancher le backend

1. Redémarrer `npm run dev:backend`
2. `curl http://localhost:4001/api/health` → `readyForMint: true`, `blockers: []`
3. Validation ADMIN d’une déclaration → mint on-chain → solde ECO MetaMask

## HCS topic (Feature A) — sans redeploy EVM

Prérequis : `OPERATOR_ACCOUNT_ID` (0.0.x) + `BACKEND_OPERATOR_PRIVATE_KEY` dans `.env`.

```bash
npm run create:hcs-topic
# Copier HCS_TOPIC_ID=0.0.x dans backend/.env
# Appliquer migration : database/migration_hcs_anchors.sql
```

Mirror : `HEDERA_MIRROR_NODE_URL=https://testnet.mirrornode.hedera.com`

## EcoTree NFT collection (Feature B)

```bash
npm run create:tree-collection
# Copier TREE_TOKEN_ID=0.0.x dans backend/.env
# Migration : database/migration_eco_tree.sql
```

`PUBLIC_API_BASE_URL` doit être joignable pour les metadata NFT (ex. `http://localhost:4001`).

## Validation communautaire (Feature C)

```bash
# Migration : database/migration_community_validation.sql
# Promouvoir : POST /api/admin/users/:id/role { "role": "VALIDATOR" }
```

**Important :** EcoToken / RecyclingRegistry **ne sont pas** redéployés pour A/B/C.

## Sécurité (inchangée sur le mint)

- Pas de mint sans validation ADMIN **ou** quorum 2/3 VALIDATOR
- Pas de double reward (`isProcessed` + événement `Rewarded`)
- Montant calculé serveur (`rewardPolicy`) — jamais fourni par l’utilisateur
- `APPROVED` seulement si receipt `status=1` + preuve complète
- `readyForMint` n’est jamais forcé artificiellement
- Échec HCS/HTS ≠ échec mint

## Mainnet

**Interdit** pour ce projet / ces scripts.
