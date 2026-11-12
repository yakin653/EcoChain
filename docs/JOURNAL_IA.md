# Journal d’utilisation de l’IA générative (critère académique)

Projet : EcoChain · Outil principal : **Cursor Agent** (assistance au développement) · Auteurs : Fatimetou & Yakin.

Ce journal documente l’usage GenAI **pour construire le logiciel**, distinct du module produit « Trash Classifier V2 » (IA locale assistive).

## Principes appliqués

1. Formuler des prompts précis (objectif, contraintes, fichiers, interdits).  
2. **Vérifier** chaque proposition (compilation, tests, RPC, health).  
3. **Corriger** les erreurs détectées (ex. Hashio `eth_getLogs` > 7 jours, spawn Windows).  
4. Ne jamais accepter un faux succès blockchain ni inventer des clés.  
5. Secrets uniquement dans `backend/.env` (gitignored).

## Sessions / usages majeurs

| Date | Objectif | Prompt / demande (résumé) | Produit IA | Vérification humaine |
|---|---|---|---|---|
| 2026-11 | Run local + expliquer architecture | Lancer stack, expliquer flux auth/déclarations/mint | Diagnostic ports, doc démo | Services UP, comptes démo |
| 2026-11 | UI auth Eco-Tech | Refonte auth sans casser MetaMask/Hedera | `App.tsx` / `style.css` auth | Build frontend OK |
| 2026-11 | Trash Classifier V2 | IA locale, MATCH/MISMATCH, jamais mint | `ai-service/`, proxy Express | `/health` model_ready, tests mapping |
| 2026-11 | Fix `readyForMint:false` | Audit→deploy Testnet 296, pas de fake | Wallet opérateur, deploy, env | `readyForMint:true`, smoke 1 ECO |
| 2026-11 | E2E mint réel | USER déclaration → ADMIN validate | Script API E2E | APPROVED + 12 ECO on-chain |
| 2026-11 | Bug Hashio logs | Corriger preuve Rewarded | `findRewardedProofInReceipt` | Validate → APPROVED |
| 2026-11 | Design maquettes | Forest glass dashboard | CSS/App redesign | UI navigateur |
| 2026-11 | Grille 20/20 | Pause, cap, tests attaque, docs | Contrats + SECURITY/JOURNAL/QR | `npm run test:contracts` |
| 2026-11 | ECO IMPACT | Dashboard CO₂ APPROVED only | impactService + EcoImpact UI | APIs me/admin, readyForMint intact |
| 2026-11 | HCS + EcoTree + communauté | Features A/B/C sans redeploy mint | hcsService, treeService, validation 2/3 | 57 tests backend ; docs ARCH/SEC/DEMO |

## Exemples de prompts efficaces

- « Résous `readyForMint:false` sur Hedera Testnet 296. Ne simule jamais un deploy. Secrets seulement dans `.env`. »  
- « L’IA photo ne doit jamais approuver ni mint — statut reste PENDING. »  
- « Fix preuve Rewarded : Hashio refuse eth_getLogs > 7 jours — utiliser le receipt. »

## Erreurs IA détectées et corrigées

| Erreur | Détection | Correction |
|---|---|---|
| Deploy watcher `spawn EINVAL` sur Windows | Exit code 1 après faucet | `shell: true` pour `npm.cmd` |
| `queryFilter` depuis bloc 0 → 502 Hashio | Validate ADMIN 502 | Preuve via receipt + fenêtre bornée |
| Reload backend `EADDRINUSE` | Health stale env | Kill port 4001 + restart |

## Ce qui n’a PAS été délégué aveuglément

- Choix métier anti-double-paiement et machine à états APPROVED  
- Décision Testnet-only / pas Mainnet  
- Validation humaine ADMIN avant mint  
- Revue des adresses avant `setMinter` (irréversible)

## Maîtrise du code assisté

Nous savons expliquer : `declarationKey`, `processReward`, `collectRewardProof`, `setMinter`, `pause`/`maxRewardWei`, `readyForMint`, rôle de l’IA déchets, HCS anchors, EcoTree levels, quorum VALIDATOR 2/3.  
Preuve d’exécution : tests Hardhat + smoke Testnet + `/api/health` + `npm run test:backend`.
