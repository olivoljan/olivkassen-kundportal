"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabaseClient";

const DESIGN = {
  background: "#f4f1ea",
  cardBg: "#ffffff",
  primaryGreen: "#1f5f2f",
  darkGreen: "#163d1f",
  textPrimary: "#2e3a2d",
  mutedText: "#6b6b6b",
  softBorder: "#e8e4db",
  largeRadius: 32,
  pillRadius: 999,
  buttonPadding: 18,
  sectionSpacing: 40,
  cardPadding: 60,
  cardShadow: "0 30px 80px rgba(0,0,0,0.05)",
};

export default function AccountPage() {
  const supabase = createClient();

  const [email, setEmail] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<any>(null);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [primaryHover, setPrimaryHover] = useState(false);
  const [linkHover, setLinkHover] = useState<string | null>(null);
  const [modalPrimaryHover, setModalPrimaryHover] = useState(false);

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
  
      setLoading(false); // 🔥 ALWAYS run this
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
      return badge("#dcfce7", DESIGN.primaryGreen, "Aktiv prenumeration");

    if (subscription.status === "paused")
      return badge("#fef3c7", "#92400e", "Pausad prenumeration");

    if (subscription.status === "canceling")
      return badge("#fde68a", "#b45309", "Avslutas vid periodens slut");

    if (subscription.status === "canceled")
      return badge("#fee2e2", "#991b1b", "Avslutad prenumeration");

    return null;
  };

  /* ================= RENDER ================= */

  return (
    <div
      style={{
        minHeight: "100vh",
        background: DESIGN.background,
        padding: `${DESIGN.sectionSpacing}px 20px`,
      }}
    >
      <div
        style={{
          maxWidth: 640,
          margin: "0 auto",
          background: DESIGN.cardBg,
          padding: DESIGN.cardPadding,
          borderRadius: DESIGN.largeRadius,
          boxShadow: DESIGN.cardShadow,
          border: `1px solid ${DESIGN.softBorder}`,
        }}
      >
        <h2
          style={{
            fontSize: 28,
            fontWeight: 600,
            color: DESIGN.textPrimary,
            marginBottom: DESIGN.sectionSpacing,
          }}
        >
          Mitt konto
        </h2>

        <p
          style={{
            color: DESIGN.textPrimary,
            marginBottom: 16,
          }}
        >
          <strong style={{ color: DESIGN.textPrimary }}>E-post:</strong>{" "}
          {email ?? "—"}
        </p>

        {loading && (
          <p style={{ color: DESIGN.mutedText }}>Laddar prenumeration...</p>
        )}

        {!loading && subscription?.status && (
          <>
            {subscription.customer_name && (
              <p
                style={{
                  color: DESIGN.textPrimary,
                  marginBottom: 16,
                }}
              >
                Hej {subscription.customer_name},
              </p>
            )}

            <h3
              style={{
                fontSize: 20,
                fontWeight: 600,
                color: DESIGN.textPrimary,
                marginBottom: 16,
                marginTop: DESIGN.sectionSpacing,
              }}
            >
              Prenumeration
            </h3>

            {renderStatusBadge()}

            {subscription.status !== "canceled" && (
              <>
                <p
                  style={{
                    color: DESIGN.textPrimary,
                    marginBottom: 12,
                  }}
                >
                  <strong style={{ color: DESIGN.textPrimary }}>Produkt:</strong>{" "}
                  {subscription.product}
                </p>

                <p
                  style={{
                    color: DESIGN.textPrimary,
                    marginBottom: 12,
                  }}
                >
                  <strong style={{ color: DESIGN.textPrimary }}>Pris:</strong>{" "}
                  {(subscription.amount / 100).toFixed(2)}{" "}
                  {subscription.currency?.toUpperCase()} – var{" "}
                  {subscription.interval_count}:e månad
                </p>

                {subscription.current_period_end && (
                  <p
                    style={{
                      color: DESIGN.textPrimary,
                      marginBottom: 12,
                    }}
                  >
                    <strong style={{ color: DESIGN.textPrimary }}>
                      Nästa leverans:
                    </strong>{" "}
                    {formatDate(subscription.current_period_end)}
                  </p>
                )}

                <div style={{ marginTop: DESIGN.sectionSpacing }}>
                  <button
                    onClick={handlePortal}
                    onMouseEnter={() => setPrimaryHover(true)}
                    onMouseLeave={() => setPrimaryHover(false)}
                    style={{
                      width: "100%",
                      padding: DESIGN.buttonPadding,
                      borderRadius: DESIGN.pillRadius,
                      border: "none",
                      background: primaryHover ? DESIGN.darkGreen : DESIGN.primaryGreen,
                      color: "#fff",
                      fontWeight: 600,
                      cursor: "pointer",
                      marginBottom: 20,
                      transition: "background 0.2s ease",
                    }}
                  >
                    Hantera prenumeration
                  </button>

                  <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
                    <span
                      onClick={handlePauseResume}
                      onMouseEnter={() => setLinkHover("pause")}
                      onMouseLeave={() => setLinkHover(null)}
                      style={{
                        cursor: "pointer",
                        textDecoration: "underline",
                        color: "#000000",
                        opacity: linkHover === "pause" ? 0.7 : 1,
                        transition: "opacity 0.2s ease",
                      }}
                    >
                      {subscription.status === "paused"
                        ? "Återuppta prenumeration"
                        : "Pausa prenumeration"}
                    </span>

                    {subscription.status === "canceling" ? (
                      <span
                        onClick={handleUndoCancel}
                        onMouseEnter={() => setLinkHover("undo")}
                        onMouseLeave={() => setLinkHover(null)}
                        style={{
                          cursor: "pointer",
                          textDecoration: "underline",
                          color: "#000000",
                          opacity: linkHover === "undo" ? 0.7 : 1,
                          transition: "opacity 0.2s ease",
                        }}
                      >
                        Ångra avslut
                      </span>
                    ) : (
                      <span
                        onClick={() => setShowCancelModal(true)}
                        onMouseEnter={() => setLinkHover("cancel")}
                        onMouseLeave={() => setLinkHover(null)}
                        style={{
                          cursor: "pointer",
                          textDecoration: "underline",
                          color: "#000000",
                          opacity: linkHover === "cancel" ? 0.7 : 1,
                          transition: "opacity 0.2s ease",
                        }}
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

      {/* Premium Cancel Modal */}
      {showCancelModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
          }}
        >
          <div
            style={{
              maxWidth: 480,
              width: "100%",
              margin: 20,
              background: DESIGN.cardBg,
              padding: 48,
              borderRadius: DESIGN.largeRadius,
              boxShadow: "0 40px 100px rgba(0,0,0,0.08)",
              border: `1px solid ${DESIGN.softBorder}`,
              position: "relative",
            }}
          >
            <button
              type="button"
              onClick={() => setShowCancelModal(false)}
              style={{
                position: "absolute",
                top: 20,
                right: 20,
                background: "none",
                border: "none",
                fontSize: 18,
                color: DESIGN.mutedText,
                cursor: "pointer",
                padding: 4,
                lineHeight: 1,
              }}
              aria-label="Stäng"
            >
              ×
            </button>

            <div style={{ textAlign: "center" }}>
              <img
                src="https://cdn.prod.website-files.com/676d596f9615722376dfe2fc/67eee07f994057c9694ea78a_olives.png"
                alt=""
                width={60}
                height={60}
                style={{ marginBottom: 24 }}
              />

              <h3
                style={{
                  fontSize: 24,
                  fontWeight: 600,
                  color: DESIGN.textPrimary,
                  marginBottom: 20,
                }}
              >
                Vill du avsluta din prenumeration?
              </h3>

              <p
                style={{
                  color: DESIGN.mutedText,
                  lineHeight: 1.6,
                  marginBottom: 30,
                }}
              >
                Du vet väl att du även kan pausa abonnemanget? Då behåller du din
                profil och kan aktivera igen när du vill. Om du istället avslutar
                raderas din profil helt och hållet, och när du behöver registrera
                dig på nytt gäller ett nytt, högre pris.
              </p>

              <button
                type="button"
                onClick={() => {
                  setShowCancelModal(false);
                  handlePauseResume();
                }}
                onMouseEnter={() => setModalPrimaryHover(true)}
                onMouseLeave={() => setModalPrimaryHover(false)}
                style={{
                  width: "100%",
                  padding: DESIGN.buttonPadding,
                  borderRadius: DESIGN.pillRadius,
                  border: "none",
                  background: modalPrimaryHover ? DESIGN.darkGreen : DESIGN.primaryGreen,
                  color: "#fff",
                  fontWeight: 600,
                  cursor: "pointer",
                  marginBottom: 20,
                  transition: "background 0.2s ease",
                }}
              >
                Pausa
              </button>

              <button
                type="button"
                onClick={handleCancelAtEnd}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "center",
                  background: "none",
                  border: "none",
                  color: "#b91c1c",
                  textDecoration: "underline",
                  cursor: "pointer",
                  padding: 8,
                  fontSize: "inherit",
                }}
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