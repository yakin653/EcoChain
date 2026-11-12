import { FormEvent, useCallback, useEffect, useState } from "react";
import { api, ApiError, API } from "./api";
import {
  AuthUser,
  AiConsistency,
  Declaration,
  DeclarationStatus,
  displayName,
  displayWallet
} from "./types";
import { connectMetaMask, formatEcoFromWei, hasMetaMask } from "./wallet";
import WeeklyChallenge from "./WeeklyChallenge";

type Screen = "login" | "register";
type AdminFilter = DeclarationStatus;

const MATERIALS = ["Plastique", "Papier", "Verre", "Métal", "Carton", "Aluminium", "Organique", "Électronique"];

function aiBadgeClass(consistency?: AiConsistency | null) {
  if (consistency === "MATCH") return "ai-match";
  if (consistency === "MISMATCH") return "ai-mismatch";
  if (consistency === "UNCERTAIN") return "ai-uncertain";
  if (consistency === "DEGRADED") return "ai-degraded";
  return "";
}

function formatConfidence(value?: string | number | null) {
  if (value === null || value === undefined || value === "") return "—";
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return String(value);
  return `${(n * 100).toFixed(1)} %`;
}

function shortAddr(addr?: string | null) {
  if (!addr) return "—";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function shortTx(tx?: string | null) {
  if (!tx) return null;
  return `${tx.slice(0, 10)}…${tx.slice(-6)}`;
}

function EcoIllustration() {
  return (
    <svg
      className="auth-illustration"
      viewBox="0 0 640 360"
      role="img"
      aria-label="Illustration écologique : planète, ville verte et bacs de tri colorés"
    >
      <defs>
        <linearGradient id="ecoGlobe" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#7dd3fc" />
          <stop offset="55%" stopColor="#38bdf8" />
          <stop offset="100%" stopColor="#2563eb" />
        </linearGradient>
        <linearGradient id="ecoHill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4ade80" />
          <stop offset="100%" stopColor="#15803d" />
        </linearGradient>
      </defs>

      {/* skyline */}
      <g fill="#bae6fd" opacity="0.75">
        <rect x="392" y="118" width="34" height="118" rx="4" />
        <rect x="434" y="92" width="42" height="144" rx="4" />
        <rect x="484" y="132" width="30" height="104" rx="4" />
        <rect x="522" y="106" width="38" height="130" rx="4" />
      </g>
      <g fill="#e0f2fe">
        {Array.from({ length: 24 }).map((_, i) => (
          <rect key={i} x={400 + (i % 4) * 40 + (i % 2) * 6} y={108 + Math.floor(i / 4) * 20} width="8" height="10" rx="2" />
        ))}
      </g>

      {/* clouds */}
      <g fill="#ffffff" opacity="0.95">
        <ellipse cx="118" cy="78" rx="46" ry="18" />
        <ellipse cx="148" cy="66" rx="34" ry="16" />
        <ellipse cx="472" cy="54" rx="40" ry="15" />
        <ellipse cx="498" cy="44" rx="28" ry="13" />
      </g>

      {/* globe */}
      <circle cx="212" cy="208" r="104" fill="url(#ecoGlobe)" />
      <path d="M142 168c22-20 52-10 62 8 8 15-6 24-20 28-18 5-42-4-48-20-3-7 0-12 6-16Z" fill="#22c55e" />
      <path d="M238 132c20-8 48 2 54 20 5 16-10 22-24 28-16 7-36 2-42-12-5-13 0-30 12-36Z" fill="#16a34a" />
      <path d="M196 258c18-12 46-8 56 8 8 13-4 26-22 30-20 4-42-6-44-20-1-8 3-14 10-18Z" fill="#22c55e" />
      <path d="M118 226c14 34 50 62 94 62 30 0 56-12 74-32" fill="none" stroke="#ffffff" strokeOpacity="0.45" strokeWidth="5" strokeLinecap="round" />

      {/* hills */}
      <path d="M0 292 C120 252 240 286 360 262 C470 240 560 262 640 238 L640 360 L0 360 Z" fill="url(#ecoHill)" />
      <path d="M0 322 C150 292 320 322 640 292 L640 360 L0 360 Z" fill="#166534" opacity="0.35" />

      {/* leaves */}
      <g fill="#16a34a">
        <path d="M92 138c-20 2-32 16-34 34 18 0 32-12 34-34Z" />
        <path d="M330 96c-16 6-24 20-22 34 14-2 24-16 22-34Z" fill="#22c55e" />
        <path d="M356 168c-18 0-30 10-34 26 16 2 30-8 34-26Z" />
        <path d="M70 226c-14 4-22 16-22 28 12-2 22-14 22-28Z" fill="#4ade80" />
      </g>

      {/* recycling bins */}
      <g fontFamily="Arial, sans-serif" fontWeight="700" textAnchor="middle">
        <g>
          <rect x="368" y="238" width="62" height="76" rx="9" fill="#16a34a" />
          <rect x="362" y="226" width="74" height="16" rx="7" fill="#15803d" />
          <text x="399" y="284" fontSize="30" fill="#ffffff">♻</text>
        </g>
        <g>
          <rect x="442" y="238" width="62" height="76" rx="9" fill="#0284c7" />
          <rect x="436" y="226" width="74" height="16" rx="7" fill="#0369a1" />
          <text x="473" y="284" fontSize="30" fill="#ffffff">♻</text>
        </g>
        <g>
          <rect x="516" y="238" width="62" height="76" rx="9" fill="#f59e0b" />
          <rect x="510" y="226" width="74" height="16" rx="7" fill="#d97706" />
          <text x="547" y="284" fontSize="30" fill="#ffffff">♻</text>
        </g>
      </g>
    </svg>
  );
}

export default function App() {
  const [screen, setScreen] = useState<Screen>("login");
  const [token, setToken] = useState(localStorage.getItem("token") || "");
  const [user, setUser] = useState<AuthUser | null>(() => {
    try {
      return JSON.parse(localStorage.getItem("user") || "null");
    } catch {
      return null;
    }
  });
  const [feedback, setFeedback] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // Auth forms
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [pendingWallet, setPendingWallet] = useState<string | null>(null);

  // User declarations
  const [items, setItems] = useState<Declaration[]>([]);
  const [material, setMaterial] = useState("Plastique");
  const [quantity, setQuantity] = useState("1");
  const [description, setDescription] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [ecoBalance, setEcoBalance] = useState<string | null>(null);

  // Admin
  const [adminFilter, setAdminFilter] = useState<AdminFilter>("PENDING");
  const [adminItems, setAdminItems] = useState<Declaration[]>([]);
  const [overrideEco, setOverrideEco] = useState("");
  const [overrideWhy, setOverrideWhy] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const flash = (text: string, type: "ok" | "err" = "ok") => setFeedback({ text, type });

  const persistSession = (nextToken: string, nextUser: AuthUser) => {
    localStorage.setItem("token", nextToken);
    localStorage.setItem("user", JSON.stringify(nextUser));
    setToken(nextToken);
    setUser(nextUser);
  };

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setToken("");
    setUser(null);
    setItems([]);
    setAdminItems([]);
    setEcoBalance(null);
    flash("Déconnecté.");
  };

  const handleError = (e: unknown) => {
    const msg = e instanceof ApiError || e instanceof Error ? e.message : "Erreur inattendue";
    flash(msg, "err");
  };

  const refreshMe = useCallback(async (auth = token) => {
    if (!auth) return;
    const data = await api<{ user: AuthUser }>("/auth/me", { token: auth });
    const u = data.user;
    setUser(u);
    localStorage.setItem("user", JSON.stringify(u));
    return u;
  }, [token]);

  const loadMine = useCallback(async (auth = token) => {
    if (!auth) return;
    const rows = await api<Declaration[]>("/declarations/mine", { token: auth });
    setItems(rows);
  }, [token]);

  const loadBalance = useCallback(async (wallet: string | null | undefined, auth = token) => {
    if (!auth || !wallet) {
      setEcoBalance(null);
      return;
    }
    const data = await api<{ balanceBaseUnits: string }>(`/rewards/balance/${wallet}`, { token: auth });
    setEcoBalance(data.balanceBaseUnits);
  }, [token]);

  const loadAdmin = useCallback(async (status: AdminFilter = adminFilter, auth = token) => {
    if (!auth) return;
    const rows = await api<Declaration[]>(`/declarations/admin/list?status=${status}`, { token: auth });
    setAdminItems(rows);
  }, [token, adminFilter]);

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const u = await refreshMe(token);
        if (u?.role === "USER") {
          await loadMine(token);
          await loadBalance(displayWallet(u), token);
        } else if (u?.role === "ADMIN") {
          await loadAdmin(adminFilter, token);
        }
      } catch (e) {
        handleError(e);
        if (e instanceof ApiError && e.status === 401) logout();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function onLogin(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const data = await api<{ token: string; user: AuthUser }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password })
      });
      persistSession(data.token, data.user);
      // If MetaMask was connected from the auth screen, associate it now that we have a JWT.
      if (pendingWallet) {
        try {
          const walletData = await api<{ user: AuthUser }>("/auth/wallet", {
            method: "PATCH",
            token: data.token,
            body: JSON.stringify({ walletAddress: pendingWallet })
          });
          persistSession(data.token, walletData.user);
        } catch {
          // Keep the session: wallet association can be retried from the dashboard.
        }
      }
      flash(`Bienvenue ${displayName(data.user)}`);
    } catch (err) {
      handleError(err);
    } finally {
      setBusy(false);
    }
  }

  async function onRegister(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/auth/register", {
        method: "POST",
        body: JSON.stringify({ fullName, email, password, walletAddress: pendingWallet || undefined })
      });
      flash("Compte créé. Vous pouvez vous connecter.");
      setScreen("login");
      setPassword("");
    } catch (err) {
      handleError(err);
    } finally {
      setBusy(false);
    }
  }

  async function onConnectMetaMaskAuth() {
    setBusy(true);
    try {
      const address = await connectMetaMask();
      setPendingWallet(address);
      flash(
        `MetaMask connecté : ${shortAddr(address)} — il sera associé à votre compte ${
          screen === "register" ? "à l'inscription" : "après connexion"
        }.`
      );
    } catch (err) {
      handleError(err);
    } finally {
      setBusy(false);
    }
  }

  async function onCreateDeclaration(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const form = new FormData();
      form.append("material", material);
      form.append("quantity", quantity);
      if (description.trim()) form.append("description", description.trim());
      if (photoFile) form.append("photo", photoFile);

      const created = await api<{ ai_analysis?: { consistency?: string; detected_material?: string; confidence?: number } }>(
        "/declarations",
        { method: "POST", token, body: form }
      );

      if (created.ai_analysis?.consistency) {
        flash(
          `Déclaration PENDING · IA ${created.ai_analysis.consistency}` +
            (created.ai_analysis.detected_material
              ? ` (${created.ai_analysis.detected_material}, ${formatConfidence(created.ai_analysis.confidence)})`
              : "") +
            " — validation admin obligatoire."
        );
      } else {
        flash("Déclaration créée (PENDING).");
      }
      setDescription("");
      setPhotoFile(null);
      await loadMine();
    } catch (err) {
      handleError(err);
    } finally {
      setBusy(false);
    }
  }

  async function onConnectWallet() {
    setBusy(true);
    try {
      const address = await connectMetaMask();
      const data = await api<{ user: AuthUser }>("/auth/wallet", {
        method: "PATCH",
        token,
        body: JSON.stringify({ walletAddress: address })
      });
      setUser(data.user);
      localStorage.setItem("user", JSON.stringify(data.user));
      await loadBalance(displayWallet(data.user));
      flash(`Wallet associé : ${shortAddr(address)}`);
    } catch (err) {
      handleError(err);
    } finally {
      setBusy(false);
    }
  }

  async function adminAction(
    id: string,
    action: "reject" | "validate" | "retry" | "reconcile",
    body?: object
  ) {
    setBusy(true);
    try {
      const data = await api(`/declarations/admin/${id}/${action}`, {
        method: "POST",
        token,
        body: body ? JSON.stringify(body) : "{}"
      });
      flash(
        action === "validate" || action === "retry" || action === "reconcile"
          ? `Résultat : ${data.status || "OK"}${data.txHash ? ` · tx ${shortTx(data.txHash)}` : ""}`
          : "Déclaration refusée."
      );
      setSelectedId(null);
      setOverrideEco("");
      setOverrideWhy("");
      await loadAdmin();
    } catch (err) {
      handleError(err);
    } finally {
      setBusy(false);
    }
  }

  if (!token || !user) {
    return (
      <main className="auth-page">
        <section className="auth-hero" aria-labelledby="auth-hero-title">
          <div className="auth-brand">
            <span className="auth-logo" aria-hidden="true">
              ♻
            </span>
            <span className="auth-brand-name">EcoChain</span>
            <span className="auth-brand-divider" aria-hidden="true" />
            <span className="auth-chain">HEDERA TESTNET · CHAIN ID 296</span>
          </div>

          <div className="auth-hero-copy">
            <h2 id="auth-hero-title">
              Ensemble pour une planète <em>plus verte.</em>
            </h2>
            <p>Déclarez vos recyclages et gagnez des tokens ECO grâce à la blockchain !</p>
          </div>

          <ul className="auth-benefits">
            <li>
              <span className="auth-benefit-icon" aria-hidden="true">🛡️</span>
              Récompenses sécurisées
            </li>
            <li>
              <span className="auth-benefit-icon" aria-hidden="true">⛓️</span>
              Traçabilité sur Hedera
            </li>
            <li>
              <span className="auth-benefit-icon" aria-hidden="true">🌿</span>
              Un geste écologique récompensé
            </li>
          </ul>

          <EcoIllustration />
        </section>

        <section className="auth-card-wrap">
          <p className="auth-tagline">
            <span aria-hidden="true">🌿</span> Recycler aujourd'hui, récompenser demain <span aria-hidden="true">🌿</span>
          </p>

          <div className="auth-card">
            <span className="auth-card-leaf" aria-hidden="true">
              🍃
            </span>
            <h2>Bienvenue sur EcoChain</h2>
            <p className="auth-card-sub">Connectez-vous pour continuer votre aventure écologique 🌱</p>

            <div className="auth-tabs" role="tablist" aria-label="Choix du mode d'authentification">
              <button
                type="button"
                role="tab"
                aria-selected={screen === "login"}
                className={screen === "login" ? "auth-tab active" : "auth-tab"}
                onClick={() => setScreen("login")}
              >
                Connexion
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={screen === "register"}
                className={screen === "register" ? "auth-tab active" : "auth-tab"}
                onClick={() => setScreen("register")}
              >
                Inscription
              </button>
            </div>

            {feedback && (
              <p className={`feedback-banner ${feedback.type === "err" ? "err" : "ok"}`} role="status">
                {feedback.text}
              </p>
            )}

            {screen === "login" ? (
              <form className="auth-form" onSubmit={onLogin}>
                <div className="auth-field">
                  <label htmlFor="auth-email">Email</label>
                  <div className="auth-input-wrap">
                    <span className="auth-input-icon" aria-hidden="true">✉️</span>
                    <input
                      id="auth-email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      placeholder="Email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="auth-field">
                  <label htmlFor="auth-password">Mot de passe</label>
                  <div className="auth-input-wrap">
                    <span className="auth-input-icon" aria-hidden="true">🔒</span>
                    <input
                      id="auth-password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      placeholder="Mot de passe"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                    <button
                      type="button"
                      className="password-toggle"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                      aria-pressed={showPassword}
                    >
                      {showPassword ? "🙈" : "👁️"}
                    </button>
                  </div>
                </div>

                <button className="auth-submit" type="submit" disabled={busy}>
                  {busy ? "Connexion…" : "⮕  Se connecter"}
                </button>
              </form>
            ) : (
              <form className="auth-form" onSubmit={onRegister}>
                <div className="auth-field">
                  <label htmlFor="auth-fullname">Nom complet</label>
                  <div className="auth-input-wrap">
                    <span className="auth-input-icon" aria-hidden="true">👤</span>
                    <input
                      id="auth-fullname"
                      name="fullName"
                      type="text"
                      autoComplete="name"
                      placeholder="Nom complet"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      required
                      minLength={2}
                    />
                  </div>
                </div>

                <div className="auth-field">
                  <label htmlFor="auth-email">Email</label>
                  <div className="auth-input-wrap">
                    <span className="auth-input-icon" aria-hidden="true">✉️</span>
                    <input
                      id="auth-email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      placeholder="Email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="auth-field">
                  <label htmlFor="auth-password">Mot de passe (min. 10 caractères)</label>
                  <div className="auth-input-wrap">
                    <span className="auth-input-icon" aria-hidden="true">🔒</span>
                    <input
                      id="auth-password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      placeholder="Mot de passe"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={10}
                    />
                    <button
                      type="button"
                      className="password-toggle"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                      aria-pressed={showPassword}
                    >
                      {showPassword ? "🙈" : "👁️"}
                    </button>
                  </div>
                </div>

                <button className="auth-submit" type="submit" disabled={busy}>
                  {busy ? "Création…" : "⮕  Créer mon compte"}
                </button>
              </form>
            )}

            <div className="auth-divider" aria-hidden="true">
              <span>ou</span>
            </div>

            <button
              type="button"
              className="metamask-btn"
              onClick={onConnectMetaMaskAuth}
              disabled={busy || !hasMetaMask()}
            >
              <span className="metamask-fox" aria-hidden="true">🦊</span>
              {hasMetaMask()
                ? pendingWallet
                  ? `MetaMask connecté · ${shortAddr(pendingWallet)}`
                  : "Se connecter avec MetaMask"
                : "MetaMask non détecté"}
            </button>

            <p className="auth-secure">
              <span aria-hidden="true">✅</span>{" "}
              {pendingWallet
                ? `Wallet prêt à être associé : ${pendingWallet}`
                : "Connexion sécurisée sur Hedera Testnet"}
            </p>
          </div>

          <footer className="auth-footer">Projet académique Fatimetou &amp; Yakin</footer>
        </section>
      </main>
    );
  }

  const wallet = displayWallet(user);
  const isAdmin = user?.role === "ADMIN";

  return (
    <main className="shell">
      <header>
        <div className="mark">♻</div>
        <div>
          <p className="eyebrow">HEDERA TESTNET · CHAIN ID 296</p>
          <h1>EcoChain</h1>
          <p className="sub">Plateforme de suivi et de récompense du recyclage</p>
        </div>
      </header>

      <section className="notice">
        <strong>Application de démonstration</strong>
        <span>
          Les récompenses ECO ne sont marquées APPROVED qu’après confirmation on-chain. Aucune clé privée n’est
          stockée dans le navigateur.
        </span>
      </section>

      {feedback && (
        <p className={`feedback-banner ${feedback.type === "err" ? "err" : "ok"}`} role="status">
          {feedback.text}
        </p>
      )}

      <>
          <section className="panel top">
            <div>
              <h2>{isAdmin ? "Espace administrateur" : "Mon espace"}</h2>
              <p>
                {displayName(user)} · rôle <strong>{user.role}</strong>
                {wallet ? ` · ${shortAddr(wallet)}` : " · aucun wallet associé"}
              </p>
            </div>
            <button className="ghost" type="button" onClick={logout}>
              Déconnexion
            </button>
          </section>

          {!isAdmin && (
            <>
              <section className="panel">
                <div className="top">
                  <div>
                    <h2>Portefeuille & solde ECO</h2>
                    <p>Associez MetaMask (Hedera Testnet 296) pour recevoir les récompenses.</p>
                  </div>
                  <button type="button" onClick={onConnectWallet} disabled={busy || !hasMetaMask()}>
                    {hasMetaMask() ? (wallet ? "Mettre à jour MetaMask" : "Connecter MetaMask") : "MetaMask requis"}
                  </button>
                </div>
                <div className="stats">
                  <div>
                    <span className="label">Adresse</span>
                    <strong>{wallet || "Non définie"}</strong>
                  </div>
                  <div>
                    <span className="label">Solde ECO</span>
                    <strong>{formatEcoFromWei(ecoBalance)} ECO</strong>
                  </div>
                </div>
                <button
                  className="ghost"
                  type="button"
                  disabled={!wallet || busy}
                  onClick={() => loadBalance(wallet).catch(handleError)}
                >
                  Actualiser le solde
                </button>
              </section>

              <section className="panel">
                <h2>Nouvelle déclaration</h2>
                <p>
                  Photo optionnelle analysée localement (Trash Classifier V2). L&apos;IA n&apos;approuve jamais et ne
                  distribue aucun token — l&apos;admin décide.
                </p>
                <form className="form" onSubmit={onCreateDeclaration}>
                  <div className="inline">
                    <label>
                      Matière
                      <select value={material} onChange={(e) => setMaterial(e.target.value)}>
                        {MATERIALS.map((m) => (
                          <option key={m}>{m}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Quantité (kg)
                      <input
                        type="number"
                        min="0.1"
                        step="0.1"
                        value={quantity}
                        onChange={(e) => setQuantity(e.target.value)}
                        required
                      />
                    </label>
                    <button disabled={busy}>{busy ? "Analyse…" : "Envoyer"}</button>
                  </div>
                  <label>
                    Description (optionnel)
                    <input
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      maxLength={2000}
                      placeholder="Ex. bouteilles collectées au campus"
                    />
                  </label>
                  <label>
                    Photo du déchet (JPEG/PNG, max 5 Mo — optionnel)
                    <input
                      type="file"
                      accept="image/jpeg,image/png"
                      onChange={(e) => setPhotoFile(e.target.files?.[0] || null)}
                    />
                  </label>
                  {photoFile && <small>Fichier sélectionné : {photoFile.name}</small>}
                </form>
              </section>

              <section className="panel">
                <div className="top">
                  <h2>Mes déclarations</h2>
                  <button className="ghost" type="button" onClick={() => loadMine().catch(handleError)}>
                    Actualiser
                  </button>
                </div>
                {items.length === 0 ? (
                  <p>Aucune déclaration pour le moment.</p>
                ) : (
                  <div className="list">
                    {items.map((x) => (
                      <article className="item" key={x.id}>
                        <div>
                          <strong>
                            {x.material} · {x.quantity} kg
                          </strong>
                          <small>id {x.id.slice(0, 8)}…</small>
                          {x.estimated_reward_amount && (
                            <small>Estimé : {formatEcoFromWei(x.estimated_reward_amount)} ECO</small>
                          )}
                          {x.reward_amount && <small>Définitif : {formatEcoFromWei(x.reward_amount)} ECO</small>}
                          {x.tx_hash && (
                            <small>
                              Tx :{" "}
                              <a
                                href={`https://hashscan.io/testnet/transaction/${x.tx_hash}`}
                                target="_blank"
                                rel="noreferrer"
                              >
                                {shortTx(x.tx_hash)}
                              </a>
                            </small>
                          )}
                          {x.last_error && <small className="err-text">{x.last_error}</small>}
                          {x.ai_consistency && (
                            <small>
                              IA : <span className={`ai-pill ${aiBadgeClass(x.ai_consistency)}`}>{x.ai_consistency}</span>
                              {x.ai_detected_material ? ` · détecté ${x.ai_detected_material}` : ""}
                              {x.ai_confidence != null ? ` · ${formatConfidence(x.ai_confidence)}` : ""}
                            </small>
                          )}
                        </div>
                        <span className={`status ${x.status.toLowerCase()}`}>{x.status}</span>
                      </article>
                    ))}
                  </div>
                )}
              </section>

              <WeeklyChallenge
                token={token}
                isAdmin={false}
                busy={busy}
                setBusy={setBusy}
                flash={flash}
                handleError={handleError}
              />
            </>
          )}

          {isAdmin && (
            <>
              <section className="panel">
                <div className="top">
                  <div>
                    <h2>File des déclarations</h2>
                    <p>Valider / refuser / retry / réconcilier — sans mint fictif.</p>
                  </div>
                  <div className="admin-tools">
                    <select
                      value={adminFilter}
                      onChange={(e) => {
                        const v = e.target.value as AdminFilter;
                        setAdminFilter(v);
                        loadAdmin(v).catch(handleError);
                      }}
                    >
                      {(["PENDING", "PROCESSING", "APPROVED", "REJECTED", "FAILED"] as AdminFilter[]).map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                    <button className="ghost" type="button" onClick={() => loadAdmin().catch(handleError)}>
                      Actualiser
                    </button>
                  </div>
                </div>

                {adminItems.length === 0 ? (
                  <p>Aucune déclaration en statut {adminFilter}.</p>
                ) : (
                  <div className="list">
                    {adminItems.map((d) => (
                      <article className="item admin-item" key={d.id}>
                        <div>
                          <strong>
                            {d.material} · {d.quantity} kg
                          </strong>
                          <small>
                            {d.full_name || "—"} · {d.email}
                          </small>
                          <small>Wallet : {d.wallet_address || d.user_wallet_address || "—"}</small>
                          {d.estimated_reward_amount && (
                            <small>Estimé : {formatEcoFromWei(d.estimated_reward_amount)} ECO</small>
                          )}
                          {d.reward_amount && <small>Définitif : {formatEcoFromWei(d.reward_amount)} ECO</small>}
                          {d.tx_hash && <small>Tx : {shortTx(d.tx_hash)}</small>}
                          {d.last_error && <small className="err-text">{d.last_error}</small>}
                          {d.ai_consistency ? (
                            <div className={`ai-admin-box ${aiBadgeClass(d.ai_consistency)}`}>
                              <strong>
                                Analyse IA ·{" "}
                                <span className={`ai-pill ${aiBadgeClass(d.ai_consistency)}`}>{d.ai_consistency}</span>
                              </strong>
                              <small>
                                Déclaré : {d.material}
                                {d.ai_declared_material_key ? ` (${d.ai_declared_material_key})` : ""} · Détecté :{" "}
                                {d.ai_detected_material || "—"} · Confiance : {formatConfidence(d.ai_confidence)}
                              </small>
                              {d.ai_explanation && <small>{d.ai_explanation}</small>}
                              <small className="err-text">
                                Aide à la décision uniquement — validation humaine obligatoire. L&apos;IA ne mint jamais.
                              </small>
                              {d.photo_path && (
                                <a
                                  href={`${API}/declarations/admin/${d.id}/photo`}
                                  target="_blank"
                                  rel="noreferrer"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    void (async () => {
                                      try {
                                        const res = await fetch(`${API}/declarations/admin/${d.id}/photo`, {
                                          headers: { Authorization: `Bearer ${token}` }
                                        });
                                        if (!res.ok) throw new Error("Photo indisponible");
                                        const blob = await res.blob();
                                        window.open(URL.createObjectURL(blob), "_blank");
                                      } catch (err) {
                                        handleError(err);
                                      }
                                    })();
                                  }}
                                >
                                  Voir la photo
                                </a>
                              )}
                            </div>
                          ) : (
                            <small>Pas d&apos;analyse IA (déclaration sans photo).</small>
                          )}
                        </div>
                        <div className="admin-actions">
                          <span className={`status ${d.status.toLowerCase()}`}>{d.status}</span>
                          {d.status === "PENDING" && (
                            <>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => {
                                  const body =
                                    selectedId === d.id && overrideEco
                                      ? { amountEco: overrideEco, justification: overrideWhy }
                                      : {};
                                  if (body.amountEco && (!overrideWhy || overrideWhy.trim().length < 5)) {
                                    flash("Justification obligatoire (≥5 car.) pour un override", "err");
                                    return;
                                  }
                                  adminAction(d.id, "validate", Object.keys(body).length ? body : undefined);
                                }}
                              >
                                Valider (humain)
                              </button>
                              <button
                                className="ghost danger"
                                type="button"
                                disabled={busy}
                                onClick={() => adminAction(d.id, "reject")}
                              >
                                Refuser
                              </button>
                              <button
                                className="ghost"
                                type="button"
                                onClick={() => setSelectedId(selectedId === d.id ? null : d.id)}
                              >
                                Override…
                              </button>
                            </>
                          )}
                          {d.status === "FAILED" && (
                            <button type="button" disabled={busy} onClick={() => adminAction(d.id, "retry")}>
                              Retry
                            </button>
                          )}
                          {d.status === "PROCESSING" && (
                            <button type="button" disabled={busy} onClick={() => adminAction(d.id, "reconcile")}>
                              Réconcilier
                            </button>
                          )}
                        </div>
                        {selectedId === d.id && d.status === "PENDING" && (
                          <div className="override-box">
                            <label>
                              Montant ECO override (optionnel)
                              <input
                                value={overrideEco}
                                onChange={(e) => setOverrideEco(e.target.value)}
                                placeholder="ex. 30"
                              />
                            </label>
                            <label>
                              Justification (obligatoire si override)
                              <input
                                value={overrideWhy}
                                onChange={(e) => setOverrideWhy(e.target.value)}
                                placeholder="Motif administrateur"
                              />
                            </label>
                          </div>
                        )}
                      </article>
                    ))}
                  </div>
                )}
              </section>

              <WeeklyChallenge
                token={token}
                isAdmin
                busy={busy}
                setBusy={setBusy}
                flash={flash}
                handleError={handleError}
              />
            </>
          )}
      </>

      <footer>Projet académique Fatimetou & Yakin</footer>
    </main>
  );
}
