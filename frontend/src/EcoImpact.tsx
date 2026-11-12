import { useCallback, useEffect, useState } from "react";
import { api } from "./api";

export type ImpactDashboard = {
  scope: "user" | "platform";
  totals: {
    quantityKg: number;
    co2Kg: number;
    approvedDeclarations: number;
    ecoRewarded: string;
    treesEquivalent: number;
    carKmEquivalent: number;
  };
  byMaterial: Array<{
    materialKey: string;
    label: string;
    quantityKg: number;
    co2Kg: number;
    declarations: number;
    percentOfTotalKg: number;
  }>;
  weekly: Array<{ period: string; quantityKg: number; co2Kg: number; declarations: number }>;
  monthly: Array<{ period: string; quantityKg: number; co2Kg: number; declarations: number }>;
  recent: Array<{
    id: string;
    material: string;
    quantityKg: number;
    co2Kg: number;
    rewardEco: string | null;
    processedAt: string | null;
    txHash: string | null;
  }>;
  topContributors?: Array<{
    userId: string;
    fullName: string;
    email: string;
    quantityKg: number;
    co2Kg: number;
    declarations: number;
  }>;
  methodology: {
    onlyApproved: true;
    treesNote: string;
    carNote: string;
  };
};

type Props = {
  token: string;
  mode: "user" | "admin";
  handleError: (e: unknown) => void;
};

function shortTx(tx?: string | null) {
  if (!tx) return null;
  return `${tx.slice(0, 10)}…${tx.slice(-6)}`;
}

function maxOf(points: Array<{ quantityKg: number }>) {
  return Math.max(1, ...points.map((p) => p.quantityKg));
}

export default function EcoImpact({ token, mode, handleError }: Props) {
  const [data, setData] = useState<ImpactDashboard | null>(null);
  const [busy, setBusy] = useState(false);
  const [series, setSeries] = useState<"weekly" | "monthly">("weekly");

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const path = mode === "admin" ? "/impact/admin" : "/impact/me";
      const rows = await api<ImpactDashboard>(path, { token });
      setData(rows);
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  }, [token, mode, handleError]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!data) {
    return (
      <section className="glass impact-panel">
        <div className="panel-head">
          <div>
            <h2>ECO IMPACT</h2>
            <p>{busy ? "Chargement de l’impact…" : "Aucune donnée pour le moment."}</p>
          </div>
          <button className="ghost" type="button" onClick={() => load()} disabled={busy}>
            Actualiser
          </button>
        </div>
      </section>
    );
  }

  const chart = series === "weekly" ? data.weekly : data.monthly;
  const chartMax = maxOf(chart);

  return (
    <section className="glass impact-panel">
      <div className="panel-head">
        <div>
          <h2>ECO IMPACT</h2>
          <p>
            {mode === "admin" ? "Impact environnemental de la plateforme" : "Votre impact environnemental"} ·
            déclarations <strong>APPROVED</strong> uniquement
          </p>
        </div>
        <button className="ghost" type="button" onClick={() => load()} disabled={busy}>
          Actualiser
        </button>
      </div>

      <div className="impact-kpis">
        <article className="impact-kpi">
          <span className="label">Recyclé</span>
          <strong>{data.totals.quantityKg} kg</strong>
        </article>
        <article className="impact-kpi">
          <span className="label">CO₂ évité</span>
          <strong>{data.totals.co2Kg} kg</strong>
        </article>
        <article className="impact-kpi">
          <span className="label">Validées</span>
          <strong>{data.totals.approvedDeclarations}</strong>
        </article>
        <article className="impact-kpi">
          <span className="label">ECO mintés</span>
          <strong>{data.totals.ecoRewarded}</strong>
        </article>
        <article className="impact-kpi">
          <span className="label">≈ Arbres / an</span>
          <strong>{data.totals.treesEquivalent}</strong>
        </article>
        <article className="impact-kpi">
          <span className="label">≈ km voiture</span>
          <strong>{data.totals.carKmEquivalent}</strong>
        </article>
      </div>

      <div className="impact-grid">
        <div>
          <h3>Répartition par matière</h3>
          {data.byMaterial.length === 0 ? (
            <p className="sub">Aucune déclaration validée pour l’instant.</p>
          ) : (
            <ul className="impact-bars">
              {data.byMaterial.map((m) => (
                <li key={m.materialKey}>
                  <div className="impact-bar-meta">
                    <span>
                      {m.label} · {m.quantityKg} kg
                    </span>
                    <span>{m.co2Kg} kg CO₂</span>
                  </div>
                  <div className="impact-bar-track">
                    <div className="impact-bar-fill" style={{ width: `${Math.min(100, m.percentOfTotalKg)}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <div className="impact-series-head">
            <h3>Évolution</h3>
            <div className="impact-series-tabs">
              <button
                type="button"
                className={series === "weekly" ? "material-chip active" : "material-chip"}
                onClick={() => setSeries("weekly")}
              >
                Semaines
              </button>
              <button
                type="button"
                className={series === "monthly" ? "material-chip active" : "material-chip"}
                onClick={() => setSeries("monthly")}
              >
                Mois
              </button>
            </div>
          </div>
          {chart.length === 0 ? (
            <p className="sub">Pas encore d’historique temporel.</p>
          ) : (
            <ul className="impact-bars impact-series">
              {chart.map((p) => (
                <li key={p.period}>
                  <div className="impact-bar-meta">
                    <span>{p.period}</span>
                    <span>
                      {p.quantityKg} kg · {p.declarations} decl.
                    </span>
                  </div>
                  <div className="impact-bar-track">
                    <div
                      className="impact-bar-fill"
                      style={{ width: `${Math.min(100, (p.quantityKg / chartMax) * 100)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="impact-grid">
        <div>
          <h3>Historique validé</h3>
          {data.recent.length === 0 ? (
            <p className="sub">Aucun historique.</p>
          ) : (
            <div className="list">
              {data.recent.map((r) => (
                <article className="item" key={r.id}>
                  <div>
                    <strong>
                      {r.material} · {r.quantityKg} kg
                    </strong>
                    <small>
                      {r.co2Kg} kg CO₂
                      {r.rewardEco ? ` · ${r.rewardEco} ECO` : ""}
                    </small>
                    {r.txHash && (
                      <small>
                        <a
                          href={`https://hashscan.io/testnet/transaction/${r.txHash}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {shortTx(r.txHash)}
                        </a>
                      </small>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>

        {mode === "admin" && (
          <div>
            <h3>Top contributeurs</h3>
            {!data.topContributors?.length ? (
              <p className="sub">Pas encore de contributeurs.</p>
            ) : (
              <div className="list">
                {data.topContributors.map((c) => (
                  <article className="item" key={c.userId}>
                    <div>
                      <strong>{c.fullName}</strong>
                      <small>{c.email}</small>
                      <small>
                        {c.quantityKg} kg · {c.co2Kg} kg CO₂ · {c.declarations} decl.
                      </small>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <p className="impact-footnote">
        Méthodologie pédagogique : {data.methodology.treesNote}. {data.methodology.carNote}. Les PENDING ne
        comptent jamais.
      </p>
    </section>
  );
}
