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
      
        // 🔥 Ensure Stripe customer is synced first
        await safeFetch("/api/stripe/sync-customer", {
          userId: session.user.id,
        });
      
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
    <div style={{ minHeight: "100vh", background: "#f4f1ea", padding: "40px 20px" }}>
      <div
        style={{
          maxWidth: 640,
          margin: "0 auto",
          background: "white",
          padding: 50,
          borderRadius: 28,
          boxShadow: "0 20px 60px rgba(0,0,0,0.06)",
        }}
      >
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

                {/* BUTTONS */}
                <div style={{ marginTop: 30 }}>
                  <button
                    onClick={handlePortal}
                    style={{
                      width: "100%",
                      padding: "14px",
                      borderRadius: 12,
                      border: "none",
                      background: "#166534",
                      color: "#fff",
                      fontWeight: 600,
                      cursor: "pointer",
                      marginBottom: 16,
                    }}
                  >
                    Hantera prenumeration
                  </button>

                  <div style={{ display: "flex", gap: 20 }}>
                    <span
                      onClick={handlePauseResume}
                      style={{
                        cursor: "pointer",
                        textDecoration: "underline",
                        color: "#2563eb",
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
                          color: "#b91c1c",
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
          }}
        >
          <div
            style={{
              maxWidth: 520,
              width: "100%",
              padding: 60,
              background: "white",
              borderRadius: 32,
              boxShadow: "0 20px 60px rgba(0,0,0,0.12)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
          >
            <img
              src="https://cdn.prod.website-files.com/676d596f9615722376dfe2fc/67eee07f994057c9694ea78a_olives.png"
              alt=""
              width={70}
              height={70}
              style={{ marginBottom: 30 }}
            />
            <h3 style={{ margin: "0 0 16px", textAlign: "center" }}>
              Vill du verkligen avsluta?
            </h3>
            <p
              style={{
                margin: "0 0 30px",
                textAlign: "center",
                lineHeight: 1.5,
              }}
            >
              Du vet väl att du även kan pausa abonnemanget? Då behåller du din
              profil och kan aktivera igen när du vill. Om du istället avslutar
              raderas din profil helt och hållet, och när du behöver registrera
              dig på nytt gäller ett nytt, högre pris.
            </p>

            <button
              onClick={() => {
                setShowCancelModal(false);
                handlePauseResume();
              }}
              style={{
                width: "100%",
                height: 43,
                background: "#203208",
                color: "#FBEA74",
                fontFamily: '"Bricolage Grotesque", sans-serif',
                fontWeight: 500,
                fontSize: 18,
                border: "none",
                borderRadius: 999,
                cursor: "pointer",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "#1a2906";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "#203208";
              }}
            >
              Pausa
            </button>

            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                setShowCancelModal(false);
              }}
              style={{
                marginTop: 20,
                color: "#000",
                textDecoration: "underline",
                cursor: "pointer",
                fontSize: "inherit",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.opacity = "0.8";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.opacity = "1";
              }}
            >
              Avbryt
            </a>
          </div>
        </div>
      )}
    </div>
  );
}