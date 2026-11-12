import { useCallback, useEffect, useState } from "react";
import { api, API } from "./api";

type QueueItem = {
  id: string;
  material: string;
  quantity: string;
  status: string;
  full_name?: string;
  email?: string;
  photo_path?: string | null;
  ai_consistency?: string | null;
  ai_detected_material?: string | null;
  ai_explanation?: string | null;
  vote_count?: number;
  approve_count?: number;
  reject_count?: number;
};

type Leader = {
  user_id: string;
  full_name: string;
  email: string;
  score: number;
  votes_cast: number;
  votes_correct: number;
};

type Props = {
  token: string;
  handleError: (e: unknown) => void;
  flash: (msg: string) => void;
};

export default function CommunityValidation({ token, handleError, flash }: Props) {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [busy, setBusy] = useState(false);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const [q, lb] = await Promise.all([
        api<{ queue: QueueItem[] }>("/validation/queue", { token }),
        api<{ leaderboard: Leader[] }>("/validation/leaderboard", { token })
      ]);
      setQueue(q.queue);
      setLeaders(lb.leaderboard);

      const urls: Record<string, string> = {};
      for (const item of q.queue) {
        if (!item.photo_path) continue;
        try {
          const res = await fetch(`${API}/declarations/admin/${item.id}/photo`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (res.ok) {
            const blob = await res.blob();
            urls[item.id] = URL.createObjectURL(blob);
          }
        } catch {
          /* ignore photo errors */
        }
      }
      setPhotoUrls((prev) => {
        Object.values(prev).forEach((u) => URL.revokeObjectURL(u));
        return urls;
      });
    } catch (e) {
      handleError(e);
    }
  }, [token, handleError]);

  useEffect(() => {
    void load();
    return () => {
      Object.values(photoUrls).forEach((u) => URL.revokeObjectURL(u));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  const vote = async (id: string, decision: "APPROVE" | "REJECT") => {
    setBusy(true);
    try {
      const result = await api<{ outcome: string }>(`/validation/${id}/vote`, {
        method: "POST",
        token,
        body: JSON.stringify({ decision })
      });
      flash(`Vote ${decision} — ${result.outcome}`);
      await load();
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="glass community-panel">
      <h2>Validation communautaire</h2>
      <p className="sub">2 votes sur 3 (APPROVE → mint existant · REJECT → refus). Pas d&apos;auto-vote.</p>

      <div className="community-grid">
        <div>
          <h3>File COMMUNITY_REVIEW</h3>
          {queue.length === 0 && <p className="muted">File vide.</p>}
          {queue.map((item) => (
            <article key={item.id} className="community-card">
              {photoUrls[item.id] && (
                <img src={photoUrls[item.id]} alt="Déclaration" className="community-photo" />
              )}
              <div>
                <strong>
                  {item.material} · {item.quantity} kg
                </strong>
                <p className="muted">
                  {item.full_name || item.email} · IA {item.ai_consistency || "—"}
                  {item.ai_detected_material ? ` (${item.ai_detected_material})` : ""}
                </p>
                {item.ai_explanation && <p className="muted">{item.ai_explanation}</p>}
                <p>
                  Votes : {item.approve_count || 0}✔ / {item.reject_count || 0}✖ (
                  {item.vote_count || 0}/3)
                </p>
                <div className="community-actions">
                  <button
                    type="button"
                    className="btn primary"
                    disabled={busy}
                    onClick={() => void vote(item.id, "APPROVE")}
                  >
                    Approuver
                  </button>
                  <button
                    type="button"
                    className="btn"
                    disabled={busy}
                    onClick={() => void vote(item.id, "REJECT")}
                  >
                    Refuser
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>

        <div>
          <h3>Classement validateurs</h3>
          <ul className="community-leaders">
            {leaders.map((l, i) => (
              <li key={l.user_id}>
                #{i + 1} {l.full_name} — score <strong>{l.score}</strong> ({l.votes_correct}/
                {l.votes_cast})
              </li>
            ))}
            {leaders.length === 0 && <li className="muted">Aucun score encore.</li>}
          </ul>
        </div>
      </div>
    </section>
  );
}
