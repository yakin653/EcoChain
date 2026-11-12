# Fiche Q/R — soutenance EcoChain

Apprendre ces réponses **sans lire**. Max ~7 points selon la grille.

## Blockchain & conception

**Q : Pourquoi Hedera et pas Ethereum mainnet ?**  
R : Besoin de micro-récompenses à faible coût et finalité rapide. Hedera HSCS (EVM) chain **296** Testnet + MetaMask. Mainnet volontairement exclu.

**Q : Qui mint les ECO ?**  
R : Uniquement `RecyclingRegistry`, configuré via `EcoToken.setMinter` **one-shot**. Le frontend n’a jamais la clé opérateur. Le backend owner appelle `reward` après validation ADMIN.

**Q : Pourquoi setMinter est irréversible ?**  
R : Empêche de remplacer le minter par un contrat malveillant après coup. On vérifie `token.minter() == registry` post-deploy.

## Anti-double-paiement

**Q : Comment empêchez-vous un double paiement ?**  
R : Trois niveaux — (1) `declaration_key` UNIQUE en PostgreSQL, (2) même `keccak256(uuid.lower)` backend/contrats, (3) mapping `processedDeclarations` on-chain avec mark-before-mint.

**Q : Quand passez-vous une déclaration en APPROVED ?**  
R : Seulement si `isProcessed` + receipt `status=1` + event `Rewarded` cohérent (wallet, montant, tx). Un broadcast seul ne suffit pas ; timeout → PROCESSING + reconcile, **jamais** second mint.

## Sécurité ajoutée

**Q : Que se passe-t-il si la clé opérateur fuit ?**  
R : Blast radius limité : `pause()` bloque les rewards ; `lowerMaxRewardWei` réduit le plafond (jamais d’augmentation) ; plafond initial 1000 ECO/mint aligné backend.

**Q : Pourquoi un plafond on-chain alors que le backend calcule déjà ?**  
R : Défense en profondeur — même un bug ou un abus API ne peut pas mint au-delà du cap contrat.

## Montants & IA

**Q : L’utilisateur peut-il choisir son reward ?**  
R : Non. `rewardPolicy` serveur (BigInt). Override ADMIN seulement avec justification historisée.

**Q : L’IA photo approuve-t-elle ?**  
R : Non. Assistive only (MATCH/MISMATCH…). Statut reste PENDING ; ADMIN décide ; jamais de mint IA.

## Hashio / ops

**Q : Pourquoi lire Rewarded depuis le receipt ?**  
R : Hashio refuse `eth_getLogs` sur une fenêtre > 7 jours. Avec le `tx_hash` connu, on parse les logs du receipt.

**Q : C’est quoi `readyForMint` ?**  
R : Flag honnête : clé opérateur valide + adresses token/registry. Jamais forcé si la config est incomplète.

## HCS / EcoTree / communauté (8 Q/R)

**Q : Qu’ancrez-vous sur HCS ?**  
R : Uniquement des hashes (rapport hebdo IMPACT ou preuve déclaration). Pas d’email, pas de photo brute — message `{v,type,hash,ts,ref}`.

**Q : Si HCS est down pendant un mint ?**  
R : Le mint ECO continue. L’ancrage passe `failed`/`pending` et l’admin peut retry. Jamais de rollback APPROVED.

**Q : Comment vérifier un ancrage ?**  
R : `GET /api/anchor/verify/:id` recalcule le hash depuis `payload_json` et le compare au message lu via mirror node → `valid` vert/rouge.

**Q : C’est quoi EcoTree ?**  
R : NFT HTS dynamique : un arbre par user, niveau selon CO₂ APPROVED (seed→forest). Metadata pointe vers notre API ; SVG généré serveur.

**Q : Qui détient le NFT ?**  
R : Le treasury opérateur par défaut. L’utilisateur peut « Récupérer mon arbre » vers son Account ID Hedera s’il a un wallet associé.

**Q : Qui valide en communauté ?**  
R : Rôle `VALIDATOR`. File `COMMUNITY_REVIEW`. Max 3 votes, pas d’auto-vote, UNIQUE par validateur.

**Q : 2 APPROVE mint-il comment ?**  
R : Appel au **même** `processReward` (COMMUNITY_REVIEW→PROCESSING) + triple preuve. Les validateurs ne signent jamais `registry.reward`.

**Q : Collusion de validateurs ?**  
R : Risque assumé en démo (quorum 2/3). Mitigations : ADMIN override, réputation ±1, pas de reward ECO validateurs, audit des votes dans le hash DECLARATION_PROOF.

## Limites (dire honnêtement)

Opérateur unique, JWT localStorage, rate-limit mémoire, Testnet only, pas de claim EIP-712 utilisateur, facteurs CO₂ pédagogiques.
