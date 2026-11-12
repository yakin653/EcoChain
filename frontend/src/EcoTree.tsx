import { FormEvent, useCallback, useEffect, useState } from "react";
import { api } from "./api";

type TreeDash = {
  tree: {
    id: string;
    tokenId: string;
    serial: string;
    level: string;
    lastCo2Kg: number;
    syncStatus: string;
    lastError: string | null;
    claimedAt: string | null;
    hashScanUrl: string;
    imageUrl: string;
  } | null;
  progress: {
    current: string;
    next: string | null;
    nextMinCo2Kg: number | null;
    progress01: number;
    remainingKg: number | null;
  };
  history: Array<{ from_level: string | null; to_level: string; co2_kg: string; created_at: string }>;
  configured: boolean;
};

type Props = {
  token: string;
  handleError: (e: unknown) => void;
};

const LEVEL_LABEL: Record<string, string> = {
  seed: "Graine",
  sprout: "Pousse",
  sapling: "Arbuste",
  tree: "Arbre",
  forest: "Forêt"
};

export default function EcoTree({ token, handleError }: Props) {
  const [data, setData] = useState<TreeDash | null>(null);
  const [busy, setBusy] = useState(false);
  const [accountId, setAccountId] = useState("");

  const load = useCallback(async () => {
    try {
      const d = await api<TreeDash>("/tree/me", { token });
      setData(d);
    } catch (e) {
      handleError(e);
    }
  }, [token, handleError]);

  useEffect(() => {
    void load();
  }, [load]);

  const onInit = async () => {
    setBusy(true);
    try {
      await api("/tree/me/init", { method: "POST", token });
      await load();
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  };

  const onClaim = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/tree/me/claim", {
        method: "POST",
        token,
        body: JSON.stringify({ hederaAccountId: accountId })
      });
      await load();
    } catch (err) {
      handleError(err);
    } finally {
      setBusy(false);
    }
  };

  const level = data?.tree?.level || data?.progress.current || "seed";
  const pct = Math.round((data?.progress.progress01 || 0) * 100);

  return (
    <section className="glass eco-tree-panel">
      <h3>Mon arbre EcoTree</h3>
      <p className="sub">NFT dynamique HTS — la croissance suit le CO₂ des déclarations APPROVED uniquement.</p>

      <div className="eco-tree-layout">
        <div className={`eco-tree-stage level-${level}`} aria-hidden>
          <div className="eco-tree-glow" />
          <div className="eco-tree-visual" data-level={level} />
          <strong className="eco-tree-level-label">{LEVEL_LABEL[level] || level}</strong>
        </div>

        <div className="eco-tree-meta">
          {!data?.tree && (
            <button type="button" className="btn primary" disabled={busy || !data?.configured} onClick={() => void onInit()}>
              Faire germer mon arbre
            </button>
          )}
          {data?.tree && (
            <>
              <p>
                CO₂ cumulé : <strong>{data.tree.lastCo2Kg} kg</strong>
                {data.progress.next && data.progress.remainingKg != null && (
                  <> · encore {data.progress.remainingKg} kg vers {LEVEL_LABEL[data.progress.next]}</>
                )}
              </p>
              <div className="eco-tree-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                <div className="eco-tree-bar-fill" style={{ width: `${pct}%` }} />
              </div>
              <p className="muted">Sync NFT : {data.tree.syncStatus}</p>
              <a className="btn ghost" href={data.tree.hashScanUrl} target="_blank" rel="noreferrer">
                Voir sur HashScan
              </a>
              {!data.tree.claimedAt && (
                <form className="eco-tree-claim" onSubmit={(e) => void onClaim(e)}>
                  <input
                    placeholder="Account ID Hedera (0.0.x)"
                    value={accountId}
                    onChange={(e) => setAccountId(e.target.value)}
                    required
                  />
                  <button type="submit" className="btn" disabled={busy}>
                    Récupérer mon arbre
                  </button>
                </form>
              )}
            </>
          )}
          {data && !data.configured && (
            <p className="muted">TREE_TOKEN_ID non configuré — lancez npm run create:tree-collection</p>
          )}
        </div>
      </div>

      {data?.history && data.history.length > 0 && (
        <ul className="eco-tree-history">
          {data.history.map((h, i) => (
            <li key={`${h.created_at}-${i}`}>
              {h.from_level || "—"} → <strong>{h.to_level}</strong> ({h.co2_kg} kg CO₂)
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
