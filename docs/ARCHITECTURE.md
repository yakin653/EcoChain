# Architecture EcoChain — conception Blockchain

## Pourquoi Hedera Testnet (Chain ID 296) ?

| Critère métier | Choix | Justification |
|---|---|---|
| Coût / finalité rapide | Hedera HSCS (EVM) | Frais faibles, finalité rapide adaptée à des micro-récompenses ECO |
| Compatibilité outils | Solidity + Hardhat + ethers.js + MetaMask | Même stack qu’Ethereum, portable en soutenance |
| Réseau | **Testnet only (296)** via Hashio RPC | Jamais Mainnet — démo académique sans fonds réels |
| Identité utilisateur | Wallet EVM MetaMask | L’utilisateur reçoit ECO ; le backend ne détient jamais sa clé |

## Architecture logique

```
[Frontend React] --JWT--> [Backend Express]
                              |-- PostgreSQL (déclarations, anti-doublon declaration_key)
                              |-- rewardPolicy (montant serveur, jamais client)
                              |-- blockchainService (opérateur ECDSA)
                              v
                    [RecyclingRegistry] --mint--> [EcoToken]
                              ^
                         onlyOwner + pause + maxRewardWei
```

## Décisions de conception (trade-offs assumés)

1. **Mint centralisé par l’opérateur backend** (`onlyOwner`)  
   - *Pourquoi* : l’admin valide humainement avant tout paiement ; pas de claim libre utilisateur.  
   - *Limite* : la clé opérateur est un point de défaillance unique → mitigée par `pause()`, plafond `maxRewardWei` (abaissable seulement), et secrets hors Git.

2. **`EcoToken.setMinter(registry)` one-shot**  
   - Empêche de rediriger le mint vers un contrat malveillant après déploiement.

3. **Anti-double-paiement à 3 niveaux**  
   - DB `UNIQUE(declaration_key)`  
   - `declarationId = keccak256(uuid.lower)` partagé backend/contrats  
   - mapping on-chain `processedDeclarations` (mark-before-mint)

4. **APPROVED seulement avec preuve triple**  
   - `isProcessed` + receipt `status=1` + event `Rewarded` (wallet/montant/tx)  
   - Timeout après broadcast → `PROCESSING` + reconcile (jamais second mint)

5. **IA déchets assistive only**  
   - Ne change jamais le statut, ne mint jamais ; validation ADMIN obligatoire.

## Menaces & contrôles

| Menace | Contrôle |
|---|---|
| Double reward | mapping + UNIQUE + preuves |
| Mint non autorisé | onlyOwner + minter=registry only |
| Clé opérateur compromise | `pause()`, `lowerMaxRewardWei` |
| Montant forgé par client | calcul serveur + cap on-chain 1000 ECO |
| Brute-force login | rate-limit `/api/auth` |
| Logs RPC Hashio > 7j | preuve via receipt (`findRewardedProofInReceipt`) |

## Extensions livrées (sans toucher EcoToken / RecyclingRegistry)

### A — HCS (Consensus) : journal d’impact infalsifiable
- Topic HCS Testnet (`HCS_TOPIC_ID`) créé via `npm run create:hcs-topic`.
- Messages `{v,type,hash,ts,ref}` — **hashes seulement** (pas de PII).
- Types : `IMPACT_WEEKLY` (rapport ECO IMPACT APPROVED), `DECLARATION_PROOF` (photo+IA+tx+votes).
- Échec HCS → `anchors.status=failed` + retry ADMIN — **jamais** d’annulation du mint.

### B — HTS EcoTree NFT dynamique
- Collection NFT `TREE_TOKEN_ID` (`npm run create:tree-collection`) ; treasury = opérateur.
- Un arbre / user ; niveau depuis CO₂ APPROVED (`seed→forest`).
- Metadata ≤100 o pointe vers `/api/tree/metadata/:serial` ; SVG serveur.
- Échec mint/update NFT → `trees.sync_status=failed` — mint ECO intact.

### C — Validation communautaire 2/3
- Rôle `VALIDATOR` ; statut `COMMUNITY_REVIEW` si IA MISMATCH/UNCERTAIN/DEGRADED (ou ADMIN).
- 2 APPROVE → `processReward` (même triple preuve) ; 2 REJECT → REJECTED.
- Validateurs ne mintent jamais ; réputation ±1 (pas de reward ECO validateurs).

```
[Community 2/3 | ADMIN] → processReward → RecyclingRegistry
                              |-- try/catch → HCS anchor
                              |-- try/catch → EcoTree sync
```

## Périmètre volontairement hors démo

EIP-712 claim utilisateur, DAO, marketplace NFT secondary, Mainnet — extensions futures.
