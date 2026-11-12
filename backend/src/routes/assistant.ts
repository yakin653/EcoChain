import { Router } from "express";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { z } from "zod";
import { env } from "../config/env";
import { authenticate } from "../middleware/auth";

const router = Router();

const SYSTEM =
  "Tu es un assistant pédagogique sur le recyclage et EcoChain (Hedera Testnet). " +
  "Ne prétends jamais valider une déclaration ni attribuer des tokens ECO. " +
  "L'approbation et le mint sont réservés à un ADMIN humain + smart contracts.";

/** Offline pedagogical fallback when GEMINI_API_KEY is missing — keeps the demo practical. */
function offlineAnswer(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("plastic") || m.includes("plastique")) {
    return (
      "Le plastique se trie selon le type (PET, HDPE…). Sur EcoChain, déclarez la matière et la quantité ; " +
      "l'admin valide ensuite. L'IA photo aide seulement — elle ne mint jamais d'ECO."
    );
  }
  if (m.includes("eco") || m.includes("token") || m.includes("récompens") || m.includes("recompens")) {
    return (
      "Les tokens ECO sont mintés on-chain uniquement après validation ADMIN, via RecyclingRegistry sur Hedera Testnet (296). " +
      "Le montant est calculé côté serveur (jamais par l'utilisateur)."
    );
  }
  if (m.includes("hedera") || m.includes("metamask") || m.includes("wallet")) {
    return (
      "Connectez MetaMask au réseau Hedera Testnet (Chain ID 296, RPC https://testnet.hashio.io/api). " +
      "Associez votre adresse dans EcoChain pour recevoir les ECO après APPROVED."
    );
  }
  if (m.includes("verre") || m.includes("papier") || m.includes("métal") || m.includes("metal") || m.includes("aluminium")) {
    return (
      "Chaque matière a un taux ECO/kg différent (politique serveur). Déclarez précisément ; " +
      "une photo optionnelle déclenche une analyse locale assistive (MATCH/MISMATCH), sans décision automatique."
    );
  }
  return (
    "Conseil EcoChain : triez correctement, déclarez matière + kg, joignez une photo si possible. " +
    "Statut PENDING → validation humaine → mint ECO on-chain. Je ne valide pas et je ne distribue aucun token."
  );
}

router.post("/", authenticate, async (req, res) => {
  const parsed = z.object({ message: z.string().min(1).max(2000) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Message invalide" });

  if (!env.geminiApiKey) {
    return res.json({
      answer: offlineAnswer(parsed.data.message),
      source: "offline",
      note: "Assistant pédagogique local (GEMINI_API_KEY absente). Ne valide / ne mint jamais."
    });
  }

  try {
    const genAI = new GoogleGenerativeAI(env.geminiApiKey);
    const model = genAI.getGenerativeModel({
      model: env.geminiModel,
      systemInstruction: SYSTEM
    });
    const result = await model.generateContent(parsed.data.message);
    res.json({ answer: result.response.text(), source: "gemini" });
  } catch {
    res.json({
      answer: offlineAnswer(parsed.data.message),
      source: "offline-fallback",
      note: "Gemini indisponible — réponse pédagogique locale. Ne valide / ne mint jamais."
    });
  }
});

export default router;
