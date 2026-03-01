"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import styles from "./page.module.css";

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

  const handlePauseResume = async () => {
    if (!session?.user?.id) return;

    const res = await fetch("/api/stripe/pause", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: session.user.id }),
    });

    const data = await res.json();
    if (data.status) {
      setSubscription((prev: any) => ({
        ...prev,
        status: data.status,
      }));
    }
  };

  const handleCancelAtEnd = async () => {
    if (!session?.user?.id) return;

    const res = await fetch("/api/stripe/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: session.user.id }),
    });

    const data = await res.json();
    if (data.status === "canceling") {
      setSubscription((prev: any) => ({
        ...prev,
        status: "canceling",
      }));
    }

    setShowCancelModal(false);
  };

  const handleUndoCancel = async () => {
    if (!session?.user?.id) return;

    const res = await fetch("/api/stripe/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: session.user.id, undo: true }),
    });

    const data = await res.json();
    if (data.status === "active") {
      setSubscription((prev: any) => ({
        ...prev,
        status: "active",
      }));
    }
  };

  const handlePortal = async () => {
    if (!session?.user?.id) return;

    const res = await fetch("/api/stripe/portal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: session.user.id }),
    });

    const data = await res.json();
    if (data.url) window.location.href = data.url;
  };

  useEffect(() => {
    async function load() {
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

      const res = await fetch("/api/stripe/subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: currentSession.user.id }),
      });

      const json = await res.json();
      setSubscription(json);
      setLoading(false);
    }

    load();
  }, []);

  const renderStatus = () => {
    if (!subscription?.status) return null;

    return (
      <span className={`${styles.badge} ${styles[subscription.status]}`}>
        {subscription.status === "active" && "Aktiv prenumeration"}
        {subscription.status === "paused" && "Pausad"}
        {subscription.status === "canceling" && "Avslutas vid periodens slut"}
        {subscription.status === "canceled" && "Avslutad"}
      </span>
    );
  };

  return (
    <div className={styles.wrapper}>
      <div className={styles.card}>
        <h1 className={styles.heading}>Mitt konto</h1>

        <p className={styles.email}>
          <strong>E-post:</strong> {email}
        </p>

        {loading && <p>Laddar…</p>}

        {!loading && subscription?.status && (
          <>
            {subscription.customer_name && (
              <p className={styles.greeting}>
                Hej {subscription.customer_name},
              </p>
            )}

            <h2 className={styles.sectionTitle}>Din prenumeration</h2>

            {renderStatus()}

            <div className={styles.details}>
              <p>
                <strong>Produkt:</strong> {subscription.product}
              </p>

              <p>
                <strong>Frekvens:</strong> Var {subscription.interval_count}{" "}
                {subscription.interval === "month"
                  ? "månad"
                  : subscription.interval}
              </p>

              <p>
                <strong>Pris:</strong>{" "}
                {(subscription.amount / 100).toFixed(0)} kr
              </p>
            </div>

            {subscription.customer_address && (
              <div className={styles.addressBox}>
                <strong>Leveransadress</strong>
                <div>
                  {subscription.customer_address.line1}
                  <br />
                  {subscription.customer_address.postal_code}{" "}
                  {subscription.customer_address.city}
                  <br />
                  {subscription.customer_address.country}
                </div>
              </div>
            )}

            <button
              onClick={handlePortal}
              className={styles.primaryButton}
            >
              Hantera prenumeration
            </button>

            <div className={styles.links}>
              <a onClick={handlePauseResume}>
                {subscription.status === "paused"
                  ? "Återuppta prenumeration"
                  : "Pausa prenumeration"}
              </a>

              {subscription.status === "canceling" ? (
                <a onClick={handleUndoCancel}>
                  Ångra avslut
                </a>
              ) : (
                <a
                  className={styles.danger}
                  onClick={() => setShowCancelModal(true)}
                >
                  Avsluta prenumeration
                </a>
              )}
            </div>
          </>
        )}
      </div>

      {showCancelModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <h3>Vill du verkligen avsluta?</h3>
            <p>
              Du kan pausa istället och fortsätta senare.
            </p>

            <div className={styles.modalButtons}>
              <button
                onClick={() => {
                  setShowCancelModal(false);
                  handlePauseResume();
                }}
                className={styles.secondaryButton}
              >
                Pausa istället
              </button>

              <button
                onClick={handleCancelAtEnd}
                className={styles.dangerButton}
              >
                Avsluta vid periodens slut
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}