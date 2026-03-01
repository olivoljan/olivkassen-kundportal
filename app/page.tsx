"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabaseClient";

const OLIVE_ICON =
  "https://cdn.prod.website-files.com/676d596f9615722376dfe2fc/67eee07f994057c9694ea78a_olives.png";

const cardStyle: React.CSSProperties = {
  background: "white",
  border: "1px solid #e8e4db",
  borderRadius: 32,
  padding: 60,
  maxWidth: 680,
  margin: "0 auto",
  boxShadow: "0 30px 80px rgba(0,0,0,0.05)",
};

const pageWrapStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: "#f4f1ea",
  padding: "40px 20px",
};

const headingStyle: React.CSSProperties = {
  fontFamily: "Bricolage Grotesque, sans-serif",
  fontWeight: 600,
  color: "#2e3a2d",
  fontSize: 24,
  marginBottom: 8,
};

const bodyStyle: React.CSSProperties = {
  fontFamily: "Bricolage Grotesque, sans-serif",
  fontWeight: 400,
  color: "#6b6b6b",
  marginBottom: 24,
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

export default function Home() {
  const supabase = createClient();

  const [state, setState] = useState<"login" | "sent" | "expired">("login");

  const OliveIcon = () => (
    <img
      src={OLIVE_ICON}
      alt=""
      width={70}
      height={70}
      style={{ display: "block", margin: "0 auto 30px" }}
    />
  );

  // ===== CHECK EMAIL STATE =====
  if (state === "sent") {
    return (
      <div style={pageWrapStyle}>
        <div style={cardStyle}>
          <OliveIcon />
          <h1 style={headingStyle}>Kontrollera din e-post</h1>
          <p style={bodyStyle}>
            Vi har skickat en säker inloggningslänk till din e-postadress.
            <br />
            Klicka på länken för att fortsätta.
          </p>
          <button
            type="button"
            onClick={() => setState("expired")}
            style={linkStyle}
            onMouseOver={(e) => (e.currentTarget.style.opacity = "0.7")}
            onMouseOut={(e) => (e.currentTarget.style.opacity = "1")}
          >
            Länken fungerade inte?
          </button>
        </div>
      </div>
    );
  }

  // ===== EXPIRED STATE =====
  if (state === "expired") {
    return (
      <div style={pageWrapStyle}>
        <div style={cardStyle}>
          <OliveIcon />
          <h1 style={headingStyle}>Länken har gått ut</h1>
          <p style={bodyStyle}>
            Av säkerhetsskäl har länken gått ut.
            <br />
            Skicka en ny inloggningslänk nedan.
          </p>
          <button
            type="button"
            onClick={() => setState("sent")}
            style={primaryButtonStyle}
            onMouseOver={(e) => (e.currentTarget.style.background = "#1a4f27")}
            onMouseOut={(e) => (e.currentTarget.style.background = "#1f5f2f")}
          >
            Skicka ny länk
          </button>
        </div>
      </div>
    );
  }

  // ===== LOGIN STATE =====
  return (
    <div style={pageWrapStyle}>
      <div style={cardStyle}>
        <OliveIcon />
        <h1 style={headingStyle}>
          Logga in för att hantera ditt abonnemang
        </h1>
        <p style={bodyStyle}>
          Ange din e-postadress så skickar vi en säker inloggningslänk.
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const email = (
              e.currentTarget.elements.namedItem("email") as HTMLInputElement
            ).value;
            const { error } = await supabase.auth.signInWithOtp({
              email,
              options: {
                emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`,
              },
            });
            if (error) {
              alert(error.message);
              return;
            }
            setState("sent");
          }}
        >
          <label
            htmlFor="email"
            style={{
              display: "block",
              marginBottom: 8,
              fontWeight: 600,
              fontFamily: "Bricolage Grotesque, sans-serif",
              color: "#2e3a2d",
            }}
          >
            E-postadress
          </label>
          <input
            id="email"
            name="email"
            type="email"
            placeholder="din@email.se"
            required
            style={{
              width: "100%",
              padding: "14px 16px",
              fontSize: 16,
              borderRadius: 32,
              border: "1px solid #e8e4db",
              marginBottom: 24,
              fontFamily: "Bricolage Grotesque, sans-serif",
              color: "#2e3a2d",
              boxSizing: "border-box",
            }}
          />
          <button
            type="submit"
            style={primaryButtonStyle}
            onMouseOver={(e) => (e.currentTarget.style.background = "#1a4f27")}
            onMouseOut={(e) => (e.currentTarget.style.background = "#1f5f2f")}
          >
            Skicka inloggningslänk
          </button>
        </form>
      </div>
    </div>
  );
}
