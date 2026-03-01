"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabaseClient";

const OLIVE_ICON =
  "https://cdn.prod.website-files.com/676d596f9615722376dfe2fc/67eee07f994057c9694ea78a_olives.png";

const pageWrapStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: "#f4f1ea",
  padding: "40px 20px",
};

const cardStyle: React.CSSProperties = {
  maxWidth: 680,
  margin: "0 auto",
  background: "white",
  border: "1px solid #e8e4db",
  borderRadius: 32,
  padding: 60,
  boxShadow: "0 30px 80px rgba(0,0,0,0.05)",
  position: "relative",
};

const headingStyle: React.CSSProperties = {
  fontFamily: "Bricolage Grotesque, sans-serif",
  fontWeight: 600,
  color: "#2e3a2d",
};

const bodyStyle: React.CSSProperties = {
  fontFamily: "Bricolage Grotesque, sans-serif",
  fontWeight: 400,
  color: "#6b6b6b",
};

const linkStyle: React.CSSProperties = {
  color: "black",
  textDecoration: "underline",
  cursor: "pointer",
  fontFamily: "Bricolage Grotesque, sans-serif",
  fontWeight: 400,
  background: "none",
  border: "none",
  padding: 0,
  fontSize: 16,
};

const primaryButtonStyle: React.CSSProperties = {
  width: "100%",
  padding: 18,
  fontSize: 16,
  fontWeight: 600,
  fontFamily: "Bricolage Grotesque, sans-serif",
  background: "#1f5f2f",
  color: "white",
  border: "none",
  borderRadius: 999,
  cursor: "pointer",
  transition: "background 0.2s ease",
};

export default function AccountPage() {
  const supabase = createClient();

  const [email, setEmail] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<any>(null);
  const [showCancelModal, setShowCancelModal] = useState(false);

  /* ================= SAFE FETCH ================= */

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

  /* ================= FORMAT DATE ================= */

  const formatDate = (timestamp: number | null) => {
    if (!timestamp) return null;

    return new Date(timestamp * 1000).toLocaleDateString("sv-SE", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  };

  /* ================= LOAD DATA ================= */

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!mounted) return;

      if (session) {
        setSession(session);
        setEmail(session.user.email ?? null);

        const sub = await safeFetch("/api/stripe/subscription", {
          userId: session.user.id,
        });

        if (sub?.cancel_at_period_end) {
          sub.status = "canceling";
        }

        setSubscription(sub);
      }

      setLoading(false);
    };

    load();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (_event: any, session: any) => {
        if (session) {
          setSession(session);
          setEmail(session.user.email ?? null);
        }
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  /* ================= ACTIONS ================= */

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

  const handlePortal = async () => {
    if (!session?.user?.id) return;

    const data = await safeFetch("/api/stripe/portal", {
      userId: session.user.id,
    });

    if (data?.url) {
      window.location.href = data.url;
    }
  };

  /* ================= BADGE ================= */

  const badge = (bg: string, color: string, text: string) => (
    <div
      style={{
        display: "inline-block",
        padding: "6px 14px",
        fontSize: 12,
        fontWeight: 600,
        fontFamily: "Bricolage Grotesque, sans-serif",
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

  const linkHover = (e: React.MouseEvent<HTMLSpanElement>, over: boolean) => {
    e.currentTarget.style.opacity = over ? "0.7" : "1";
  };

  /* ================= RENDER ================= */

  return (
    <div style={pageWrapStyle}>
      <div style={cardStyle}>
        <img
          src={OLIVE_ICON}
          alt=""
          width={70}
          height={70}
          style={{ display: "block", margin: "0 auto 30px" }}
        />
        <h2 style={{ ...headingStyle, fontSize: 24, marginBottom: 16 }}>
          Mitt konto
        </h2>

        <p style={{ ...bodyStyle, marginBottom: 8 }}>
          <strong style={{ color: "#2e3a2d" }}>E-post:</strong>{" "}
          {email ?? "—"}
        </p>

        {loading && (
          <p style={bodyStyle}>Laddar prenumeration...</p>
        )}

        {!loading && subscription?.status && (
          <>
            {subscription.customer_name && (
              <p style={{ ...bodyStyle, marginBottom: 8 }}>
                Hej {subscription.customer_name},
              </p>
            )}

            <h3 style={{ ...headingStyle, fontSize: 18, marginTop: 24, marginBottom: 8 }}>
              Prenumeration
            </h3>

            {renderStatusBadge()}

            {subscription.status !== "canceled" && (
              <>
                <p style={{ ...bodyStyle, marginBottom: 8 }}>
                  <strong style={{ color: "#2e3a2d" }}>Produkt:</strong>{" "}
                  {subscription.product}
                </p>

                <p style={{ ...bodyStyle, marginBottom: 8 }}>
                  <strong style={{ color: "#2e3a2d" }}>Pris:</strong>{" "}
                  {(subscription.amount / 100).toFixed(2)}{" "}
                  {subscription.currency?.toUpperCase()} – var{" "}
                  {subscription.interval_count}:e månad
                </p>

                {subscription.current_period_end && (
                  <p style={{ ...bodyStyle, marginBottom: 8 }}>
                    <strong style={{ color: "#2e3a2d" }}>Nästa leverans:</strong>{" "}
                    {formatDate(subscription.current_period_end)}
                  </p>
                )}

                <div style={{ marginTop: 30 }}>
                  <button
                    onClick={handlePortal}
                    style={primaryButtonStyle}
                    onMouseOver={(e) =>
                      (e.currentTarget.style.background = "#1a4f27")
                    }
                    onMouseOut={(e) =>
                      (e.currentTarget.style.background = "#1f5f2f")
                    }
                  >
                    Hantera prenumeration
                  </button>

                  <div
                    style={{
                      display: "flex",
                      gap: 20,
                      marginTop: 20,
                      flexWrap: "wrap",
                    }}
                  >
                    <span
                      onClick={handlePauseResume}
                      onMouseOver={(e) => linkHover(e, true)}
                      onMouseOut={(e) => linkHover(e, false)}
                      style={linkStyle}
                    >
                      {subscription.status === "paused"
                        ? "Återuppta prenumeration"
                        : "Pausa prenumeration"}
                    </span>

                    {subscription.status === "canceling" ? (
                      <span
                        onClick={handleUndoCancel}
                        onMouseOver={(e) => linkHover(e, true)}
                        onMouseOut={(e) => linkHover(e, false)}
                        style={linkStyle}
                      >
                        Ångra avslut
                      </span>
                    ) : (
                      <span
                        onClick={() => setShowCancelModal(true)}
                        onMouseOver={(e) => linkHover(e, true)}
                        onMouseOut={(e) => linkHover(e, false)}
                        style={linkStyle}
                      >
                        Avsluta prenumeration
                      </span>
                    )}
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* MODAL */}
      {showCancelModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 50,
            padding: 20,
          }}
        >
          <div
            style={{
              maxWidth: 520,
              width: "100%",
              padding: 60,
              background: "white",
              border: "1px solid #e8e4db",
              borderRadius: 32,
              boxShadow: "0 30px 80px rgba(0,0,0,0.05)",
              position: "relative",
            }}
          >
            <button
              type="button"
              onClick={() => setShowCancelModal(false)}
              aria-label="Stäng"
              style={{
                position: "absolute",
                top: 24,
                right: 24,
                background: "none",
                border: "none",
                padding: 0,
                cursor: "pointer",
                fontSize: 20,
                color: "black",
                lineHeight: 1,
                fontFamily: "Bricolage Grotesque, sans-serif",
              }}
              onMouseOver={(e) => (e.currentTarget.style.opacity = "0.7")}
              onMouseOut={(e) => (e.currentTarget.style.opacity = "1")}
            >
              ×
            </button>

            <h3
              style={{
                ...headingStyle,
                fontSize: 20,
                marginBottom: 12,
                paddingRight: 32,
              }}
            >
              Vill du verkligen avsluta?
            </h3>
            <p
              style={{
                ...bodyStyle,
                marginBottom: 28,
              }}
            >
              Du kan pausa istället och fortsätta senare.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <button
                type="button"
                onClick={() => {
                  setShowCancelModal(false);
                  handlePauseResume();
                }}
                style={{
                  ...primaryButtonStyle,
                  width: "100%",
                }}
                onMouseOver={(e) =>
                  (e.currentTarget.style.background = "#1a4f27")
                }
                onMouseOut={(e) =>
                  (e.currentTarget.style.background = "#1f5f2f")
                }
              >
                Pausa istället
              </button>

              <button
                type="button"
                onClick={handleCancelAtEnd}
                style={{
                  ...primaryButtonStyle,
                  width: "100%",
                  background: "#2e3a2d",
                }}
                onMouseOver={(e) =>
                  (e.currentTarget.style.background = "#232e26")
                }
                onMouseOut={(e) =>
                  (e.currentTarget.style.background = "#2e3a2d")
                }
              >
                Avsluta vid periodens slut
              </button>

              <button
                type="button"
                onClick={() => setShowCancelModal(false)}
                style={linkStyle}
                onMouseOver={(e) => linkHover(e, true)}
                onMouseOut={(e) => linkHover(e, false)}
              >
                Avbryt
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
