# Rapport sécurité — Smart Contracts & backend

Date : 12 novembre 2026 · Réseau cible : Hedera Testnet 296 uniquement.

## Contrôles on-chain (`RecyclingRegistry` + `EcoToken`)

| Contrôle | Implémentation | Test |
|---|---|---|
| Accès reward | `onlyOwner` | AttackScenarios + RecyclingRegistry |
| Pause d’urgence | OZ `Pausable` | `pause blocks rewards` |
| Plafond par mint | `maxRewardWei` (1000 ECO) | `enforces maxRewardWei` |
| Abaissement du plafond | `lowerMaxRewardWei` (jamais d’augmentation) | `Can only lower max` |
| Reentrancy | OZ `ReentrancyGuard` + mark-before-mint | CEI double-call test |
| Minter unique | `setMinter` one-shot | `Minter already configured` |
| Anti-replay declarationId | `processedDeclarations` | replay attack test |

## Scénarios d’attaque couverts (Hardhat)

Fichier : `contracts/test/AttackScenarios.ts`

1. Mint direct `EcoToken.mint` par un attaquant → revert  
2. Appel `reward` non-owner → revert Ownable  
3. Replay du même `declarationId` → revert Already processed  
4. Montant > cap → revert, `isProcessed` reste false  
5. Pause après compromission → plus aucun mint  
6. Redirection `setMinter` → impossible après config  

Commande : `npm run test:contracts`

## Analyse statique

Slither / Foundry non requis pour la démo Windows. Les contrôles ci-dessus sont **démontrés par tests d’attaque exécutables** plutôt que par un rapport Slither non reproductible. Si Slither est disponible :

```bash
pip install slither-analyzer
slither contracts/contracts --filter-paths node_modules
```

## Backend

- bcrypt cost 12, JWT, Zod, helmet, CORS  
- Rate-limit `/api/auth` : 30 req / 15 min / IP (`middleware/rateLimit.ts`)  
- Montants : `rewardPolicy` BigInt, plafond 1000 ECO, override admin historisé  
- `readyForMint` jamais forcé artificiellement  

## Nouveaux surfaces (HCS / HTS / communauté)

| Menace | Contrôle |
|---|---|
| Collusion 2 validateurs | Quorum 2/3 + ADMIN override + réputation ; pas de mint direct validateurs |
| Spam de votes | UNIQUE(declaration, validator) ; max 3 votes ; rôle VALIDATOR requis |
| Auto-vote | Interdit si `validator_id == declaration.user_id` |
| Trust mirror node | Verify compare hash DB ↔ message HCS ; altération DB → `valid:false` |
| Custody NFT | NFT reste au treasury par défaut ; claim optionnel vers Account ID Hedera |
| HCS/HTS down | Statuts `pending/failed` + retry ; **jamais** rollback d’un APPROVED |

## Limites assumées (honnêteté académique)

- Opérateur unique (clé chaude) — mitigé pause/cap  
- Rate-limit in-memory (pas multi-instance)  
- JWT en localStorage (risque XSS démo)  
- Testnet uniquement  
- Facteurs CO₂ pédagogiques (pas mesures labo)  
- Quorum communautaire faible (2/3) adapté démo, pas production réglementaire
