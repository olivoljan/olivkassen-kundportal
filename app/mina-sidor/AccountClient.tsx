"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabaseClient";

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
      return badge("#dcfce7", "#166534", "Aktiv prenumeration");

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
    <div>
      <h1
        style={{
          fontSize: 32,
          marginBottom: 8,
        }}
      >
        Mina sidor
      </h1>

      {!loading && subscription?.customer_name && (
        <p
          style={{
            marginBottom: 16,
          }}
        >
          Hej {subscription.customer_name},
        </p>
      )}

      <p>
        <strong>E-post:</strong> {email ?? "—"}
      </p>

      {loading && <p style={{ marginTop: 24 }}>Laddar prenumeration...</p>}

      {!loading && subscription?.status && (
        <>
          <div style={{ marginTop: 24 }}>{renderStatusBadge()}</div>

          {subscription.status !== "canceled" && (
            <>
              <p style={{ marginTop: 8 }}>
                <strong>Produkt:</strong> {subscription.product}
              </p>

              <p>
                <strong>Pris:</strong>{" "}
                {(subscription.amount / 100).toFixed(2)}{" "}
                {subscription.currency?.toUpperCase()} – var{" "}
                {subscription.interval_count}:e månad
              </p>

              {subscription.current_period_end && (
                <p>
                  <strong>Nästa leverans:</strong>{" "}
                  {formatDate(subscription.current_period_end)}
                </p>
              )}

              {/* PRIMARY BUTTON */}
              <div style={{ marginTop: 30 }}>
                <button
                  onClick={handlePortal}
                  style={{
                    width: "100%",
                    height: 43,
                    borderRadius: 9999,
                    border: "none",
                    background: "#203208",
                    color: "#FBEA74",
                    fontFamily: "var(--font-bricolage-grotesque), system-ui, sans-serif",
                    fontWeight: 500,
                    fontSize: 18,
                    cursor: "pointer",
                  }}
                >
                  Hantera prenumeration
                </button>

                <div
                  style={{
                    marginTop: 16,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-start",
                    gap: 8,
                  }}
                >
                  <span
                    onClick={handlePauseResume}
                    style={{
                      cursor: "pointer",
                      textDecoration: "underline",
                      color: "#000",
                    }}
                  >
                    {subscription.status === "paused"
                      ? "Återuppta prenumeration"
                      : "Pausa prenumeration"}
                  </span>

                  {subscription.status === "canceling" ? (
                    <span
                      onClick={handleUndoCancel}
                      style={{
                        cursor: "pointer",
                        textDecoration: "underline",
                        color: "#000",
                      }}
                    >
                      Ångra avslut
                    </span>
                  ) : (
                    <span
                      onClick={() => setShowCancelModal(true)}
                      style={{
                        cursor: "pointer",
                        textDecoration: "underline",
                        color: "#000",
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

      {/* MODAL */}
      {showCancelModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 50,
          }}
        >
          <div
            style={{
              maxWidth: 400,
              width: "100%",
              padding: 28,
              background: "white",
              borderRadius: 20,
              position: "relative",
            }}
          >
            <button
              type="button"
              onClick={() => setShowCancelModal(false)}
              aria-label="Stäng"
              style={{
                position: "absolute",
                top: 16,
                right: 16,
                background: "transparent",
                border: "none",
                fontSize: 18,
                lineHeight: 1,
                cursor: "pointer",
                color: "#000",
              }}
            >
              ×
            </button>

            <h3 style={{ marginTop: 8, marginBottom: 8 }}>
              Vill du verkligen avsluta?
            </h3>
            <p>Du kan pausa istället och fortsätta senare.</p>

            <div
              style={{
                marginTop: 24,
                display: "flex",
                flexDirection: "column",
                alignItems: "stretch",
                gap: 12,
              }}
            >
              <button
                onClick={() => {
                  setShowCancelModal(false);
                  handlePauseResume();
                }}
                style={{
                  width: "100%",
                  height: 43,
                  borderRadius: 9999,
                  border: "none",
                  background: "#203208",
                  color: "#FBEA74",
                  fontFamily:
                    "var(--font-bricolage-grotesque), system-ui, sans-serif",
                  fontWeight: 500,
                  fontSize: 18,
                  cursor: "pointer",
                }}
              >
                Pausa
              </button>

              <button
                onClick={handleCancelAtEnd}
                style={{
                  alignSelf: "flex-start",
                  background: "transparent",
                  border: "none",
                  padding: 0,
                  color: "#000",
                  textDecoration: "underline",
                  cursor: "pointer",
                  fontSize: 14,
                }}
              >
                Avbryt prenumeration
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}