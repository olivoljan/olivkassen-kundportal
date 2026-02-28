"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";

export default function AccountPage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const [email, setEmail] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<any>(null);
  const [showCancelModal, setShowCancelModal] = useState(false);

  /* =========================
     SAFE FETCH
  ========================== */
  const safeFetch = async (url: string, body: any) => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      console.error("API error:", url, res.status);
      return null;
    }

    return await res.json();
  };

  /* =========================
     DATE FORMATTER
  ========================== */
  const formatDate = (timestamp: number | null) => {
    if (!timestamp) return null;

    return new Date(timestamp * 1000).toLocaleDateString("sv-SE", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  };

  /* =========================
     PAUSE / RESUME
  ========================== */
  const handlePauseResume = async () => {
    if (!session?.user?.id) return;

    const data = await safeFetch("/api/stripe/pause", {
      userId: session.user.id,
    });

    if (data?.status) {
      setSubscription((prev: any) => ({
        ...prev,
        status: data.status,
      }));
    }
  };

  /* =========================
     CANCEL
  ========================== */
  const handleCancelAtEnd = async () => {
    if (!session?.user?.id) return;

    const data = await safeFetch("/api/stripe/cancel", {
      userId: session.user.id,
    });

    if (data?.status === "canceling") {
      setSubscription((prev: any) => ({
        ...prev,
        status: "canceling",
      }));
    }

    setShowCancelModal(false);
  };

  const handleUndoCancel = async () => {
    if (!session?.user?.id) return;

    const data = await safeFetch("/api/stripe/cancel", {
      userId: session.user.id,
      undo: true,
    });

    if (data?.status === "active") {
      setSubscription((prev: any) => ({
        ...prev,
        status: "active",
      }));
    }
  };

  /* =========================
     STRIPE PORTAL
  ========================== */
  const handlePortal = async () => {
    if (!session?.user?.id) return;

    const data = await safeFetch("/api/stripe/portal", {
      userId: session.user.id,
    });

    if (data?.url) {
      window.location.href = data.url;
    }
  };

  /* =========================
     LOAD DATA
  ========================== */
  useEffect(() => {
    async function load() {
      try {
        let {
          data: { session: currentSession },
        } = await supabase.auth.getSession();

        if (!currentSession) {
          const { data } = await supabase.auth.refreshSession();
          currentSession = data.session;
        }

        if (!currentSession) {
          setLoading(false);
          return;
        }

        setSession(currentSession);
        setEmail(currentSession.user.email ?? null);

        const data = await safeFetch("/api/stripe/subscription", {
          userId: currentSession.user.id,
        });

        // 🔒 Ensure canceling status persists after reload
        if (data?.cancel_at_period_end) {
          data.status = "canceling";
        }

        setSubscription(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  /* =========================
     BADGE
  ========================== */
  const badge = (bg: string, color: string, text: string) => (
    <div
      style={{
        display: "inline-block",
        padding: "6px 14px",
        fontSize: 12,
        fontWeight: 600,
        color,
        background: bg,
        borderRadius: 999,
        marginTop: 10,
        marginBottom: 20,
      }}
    >
      {text}
    </div>
  );

  const renderStatusBadge = () => {
    if (!subscription?.status) return null;

    if (subscription.status === "active")
      return badge("#dcfce7", "#166534", "Aktiv prenumeration");

    if (subscription.status === "paused")
      return badge("#fef3c7", "#92400e", "Pausad prenumeration");

    if (subscription.status === "canceling")
      return badge("#fde68a", "#b45309", "Avslutas vid periodens slut");

    if (subscription.status === "canceled")
      return badge("#fee2e2", "#991b1b", "Avslutad prenumeration");

    return null;
  };

  /* =========================
     RENDER
  ========================== */

  return (
    <div style={wrapper}>
      <div style={card}>
        <h2>Mitt konto</h2>

        <p>
          <strong>E-post:</strong> {email ?? "—"}
        </p>

        {loading && <p>Laddar prenumeration...</p>}

        {!loading && subscription?.status && (
          <>
            {subscription.customer_name && (
              <p>Hej {subscription.customer_name},</p>
            )}

            <h3>Prenumeration</h3>

            {renderStatusBadge()}

            {subscription.status !== "canceled" && (
              <>
                <p>
                  <strong>Produkt:</strong> {subscription.product}
                </p>

                {/* UPDATED PRICE LINE */}
                <p>
                  <strong>Pris:</strong>{" "}
                  {(subscription.amount / 100).toFixed(2)}{" "}
                  {subscription.currency?.toUpperCase()}{" "}
                  – var {subscription.interval_count}:e månad
                </p>

                {/* NEXT DELIVERY */}
                {subscription.current_period_end && (
                  <p style={{ marginTop: 6 }}>
                    <strong>Nästa leverans:</strong>{" "}
                    {formatDate(subscription.current_period_end)}
                  </p>
                )}

                {subscription.customer_address && (
                  <div style={addressBox}>
                    <strong>Leveransadress</strong>
                    <div style={{ marginTop: 6 }}>
                      {subscription.customer_address.line1}
                      <br />
                      {subscription.customer_address.postal_code}{" "}
                      {subscription.customer_address.city}
                      <br />
                      {subscription.customer_address.country}
                    </div>
                  </div>
                )}

                <div style={{ marginTop: 30 }}>
                  <button onClick={handlePortal} style={mainButton}>
                    Hantera prenumeration
                  </button>
                </div>

                <div style={{ marginTop: 20 }}>
                  <a onClick={handlePauseResume} style={link}>
                    {subscription.status === "paused"
                      ? "Återuppta prenumeration"
                      : "Pausa prenumeration"}
                  </a>
                </div>

                {subscription.status === "canceling" ? (
                  <div style={{ marginTop: 10 }}>
                    <a onClick={handleUndoCancel} style={link}>
                      Ångra avslut
                    </a>
                  </div>
                ) : (
                  <div style={{ marginTop: 10 }}>
                    <a
                      onClick={() => setShowCancelModal(true)}
                      style={dangerLink}
                    >
                      Avsluta prenumeration
                    </a>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      {showCancelModal && (
        <div style={modalOverlay}>
          <div style={modalBox}>
            <button
              style={closeButton}
              onClick={() => setShowCancelModal(false)}
            >
              ×
            </button>

            <img
              src="https://cdn.prod.website-files.com/676d596f9615722376dfe2fc/67eee07f994057c9694ea78a_olives.png"
              width={64}
              height={64}
              style={{ margin: "0 auto 20px auto", display: "block" }}
            />

            <h3>Vill du verkligen avsluta?</h3>

            <p style={modalText}>
              Du vet väl att du även kan pausa abonnemanget? Då behåller du din
              profil och kan aktivera igen när du vill.
            </p>

            <p style={modalText}>
              Om du istället avslutar raderas din profil helt och hållet, och
              när du behöver registrera dig på nytt gäller ett nytt, högre pris.
            </p>

            <button
              onClick={() => {
                setShowCancelModal(false);
                handlePauseResume();
              }}
              style={{ ...mainButton, width: "100%", marginTop: 20 }}
            >
              Pausa abonnemanget
            </button>

            <div style={{ marginTop: 18 }}>
              <a onClick={handleCancelAtEnd} style={dangerLink}>
                Avsluta prenumeration
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* =========================
   STYLES
========================== */

const wrapper = {
  minHeight: "100vh",
  background: "#f4f1ea",
  padding: "40px 20px",
};

const card = {
  maxWidth: 640,
  margin: "0 auto",
  background: "white",
  padding: 50,
  borderRadius: 28,
  boxShadow: "0 20px 60px rgba(0,0,0,0.06)",
};

const mainButton = {
  padding: "14px 20px",
  borderRadius: 999,
  border: "none",
  background: "#0b0b0b",
  color: "white",
  cursor: "pointer",
  width: "100%",
  fontWeight: 600,
};

const link = {
  cursor: "pointer",
  color: "#111",
};

const dangerLink = {
  ...link,
  color: "#777",
};

const addressBox = {
  marginTop: 20,
  padding: 20,
  background: "#f8f6f2",
  borderRadius: 18,
};

const modalOverlay = {
  position: "fixed" as const,
  inset: 0,
  background: "rgba(0,0,0,0.45)",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
};

const modalBox = {
  background: "white",
  padding: 40,
  borderRadius: 28,
  width: 420,
  textAlign: "center" as const,
  position: "relative" as const,
};

const closeButton = {
  position: "absolute" as const,
  top: 18,
  right: 22,
  background: "none",
  border: "none",
  fontSize: 22,
  cursor: "pointer",
};

const modalText = {
  fontSize: 14,
  lineHeight: 1.6,
  color: "#444",
};