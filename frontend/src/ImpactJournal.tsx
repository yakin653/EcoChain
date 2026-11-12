import { useCallback, useEffect, useState } from "react";
import { api } from "./api";

type AnchorView = {
  id: string;
  type: string;
  ref: string;
  hash: string;
  topicId: string | null;
  sequenceNumber: string | null;
  consensusTimestamp: string | null;
  status: string;
  lastError: string | null;
  createdAt: string;
  hashScanUrl: string | null;
};

type Props = {
  token: string;
  isAdmin: boolean;
  handleError: (e: unknown) => void;
};

export default function ImpactJournal({ token, isAdmin, handleError }: Props) {
  const [anchor, setAnchor] = useState<AnchorView | null>(null);
  const [topicUrl, setTopicUrl] = useState<string | null>(null);
  const [verify, setVerify] = useState<{ valid: boolean; reason: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api<{
        anchor: AnchorView | null;
        hashScanTopicUrl: string | null;
      }>("/anchor/latest", { token });
      setAnchor(data.anchor);
      setTopicUrl(data.hashScanTopicUrl);
      setVerify(null);
    } catch (e) {
      handleError(e);
    }
  }, [token, handleError]);

  useEffect(() => {
    void load();
  }, [load]);

  const onVerify = async () => {
    if (!anchor) return;
    setBusy(true);
    try {
      const data = await api<{ valid: boolean; reason: string }>(`/anchor/verify/${anchor.id}`, { token });
      setVerify({ valid: data.valid, reason: data.reason });
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  };

  const onAnchorWeek = async () => {
    setBusy(true);
    try {
      await api("/anchor/impact", { method: "POST", token });
      await load();
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="glass impact-journal">
      <h3>Journal d&apos;impact infalsifiable</h3>
      <p className="sub">
        Ancrage HCS (Hedera Consensus) — hashes uniquement, jamais de données personnelles.
      </p>

      {!anchor && <p className="muted">Aucun ancrage pour le moment.</p>}

      {anchor && (
        <div className="journal-grid">
          <div>
            <span className="label">Type</span>
            <strong>{anchor.type}</strong>
          </div>
          <div>
            <span className="label">Statut</span>
            <strong className={`journal-status ${anchor.status}`}>{anchor.status}</strong>
          </div>
          <div className="journal-hash">
            <span className="label">Hash</span>
            <code>{anchor.hash}</code>
          </div>
          <div>
            <span className="label">Réf</span>
            <strong>{anchor.ref}</strong>
          </div>
          {anchor.sequenceNumber && (
            <div>
              <span className="label">Séquence HCS</span>
              <strong>{anchor.sequenceNumber}</strong>
            </div>
          )}
        </div>
      )}

      <div className="journal-actions">
        {(topicUrl || anchor?.hashScanUrl) && (
          <a
            className="btn ghost"
            href={topicUrl || anchor?.hashScanUrl || "#"}
            target="_blank"
            rel="noreferrer"
          >
            Topic HashScan
          </a>
        )}
        <button type="button" className="btn" disabled={!anchor || busy} onClick={() => void onVerify()}>
          Vérifier
        </button>
        {isAdmin && (
          <button type="button" className="btn primary" disabled={busy} onClick={() => void onAnchorWeek()}>
            Ancrer la semaine
          </button>
        )}
      </div>

      {verify && (
        <p className={`journal-verify ${verify.valid ? "ok" : "bad"}`}>
          {verify.valid ? "Valide" : "Invalide"} — {verify.reason}
        </p>
      )}
      {anchor?.lastError && <p className="journal-verify bad">Dernière erreur HCS : {anchor.lastError}</p>}
    </section>
  );
}
