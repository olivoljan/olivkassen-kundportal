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

  useEffect(() => {
    async function load() {
      try {
        console.log("Loading account...");
  
        // Пытаемся получить сессию
        let {
          data: { session },
        } = await supabase.auth.getSession();
  
        // Если сессии нет — пробуем обновить
        if (!session) {
          console.log("No session, trying refresh...");
  
          const { data, error } = await supabase.auth.refreshSession();
  
          if (error) {
            console.log("Refresh failed:", error.message);
            setLoading(false);
            return;
          }
  
          session = data.session;
        }
  
        if (!session) {
          console.log("Still no session");
          setLoading(false);
          return;
        }
  
        const user = session.user;
  
        console.log("Logged in user:", user.id);
  
        setEmail(user.email ?? null);
  
        const res = await fetch("/api/stripe/subscription", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ userId: user.id }),
        });
  
        if (!res.ok) {
          console.error("Subscription fetch failed:", res.status);
          setLoading(false);
          return;
        }
  
        const json = await res.json();
        console.log("Subscription response:", json);
  
        setSubscription(json);
      } catch (err) {
        console.error("Load error:", err);
      } finally {
        setLoading(false);
      }
    }
  
    load();
  }, []);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f5f5f5",
        padding: "40px 20px",
      }}
    >
      <div
        style={{
          maxWidth: 600,
          margin: "0 auto",
          background: "white",
          padding: 40,
          borderRadius: 16,
          boxShadow: "0 10px 30px rgba(0,0,0,0.05)",
        }}
      >
        <h2 style={{ marginBottom: 20 }}>Mitt konto</h2>

        <p style={{ marginBottom: 30 }}>
          <strong>E-post:</strong> {email ?? "—"}
        </p>

        {loading && <p>Laddar prenumeration...</p>}

        {!loading && !email && (
          <p style={{ color: "red" }}>
            Ingen aktiv inloggning hittades.
          </p>
        )}

        {!loading && email && !subscription && (
          <p>Ingen prenumerationsdata hittades.</p>
        )}

        {!loading &&
          subscription?.status &&
          subscription.status !== "none" && (
            <div>
              <h3>Prenumeration</h3>

              <p style={{ marginTop: 12, marginBottom: 8 }}>
                <strong>Produkt:</strong> {subscription.product ?? "—"}
              </p>
              <p style={{ marginBottom: 8 }}>
                <strong>Status:</strong> {subscription.status}
              </p>
              {subscription.current_period_end && (
                <p style={{ marginBottom: 8 }}>
                  <strong>Nästa leverans:</strong>{" "}
                  {new Date(
                    subscription.current_period_end * 1000
                  ).toLocaleDateString("sv-SE")}
                </p>
              )}
              <p style={{ marginBottom: 16 }}>
                <strong>Leveransadress:</strong> —
              </p>
            </div>
          )}
      </div>
    </div>
  );
}