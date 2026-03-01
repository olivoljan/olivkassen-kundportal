"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabaseClient";

export default function Home() {

  const supabase = createClient(); // ✅ INSIDE component

  const [state, setState] = useState<
    "login" | "sent" | "expired"
  >("login");

  // ===== CHECK EMAIL STATE =====
  if (state === "sent") {
    return (
      <div>
        <h1 style={{ fontSize: 24, marginBottom: 8 }}>
          Kontrollera din e-post
        </h1>

        <p style={{ color: "#555", marginBottom: 24 }}>
          Vi har skickat en säker inloggningslänk till din e-postadress.
          <br />
          Klicka på länken för att fortsätta.
        </p>

        <button
          onClick={() => setState("expired")}
          style={{
            border: "none",
            background: "transparent",
            color: "#555",
            cursor: "pointer",
            padding: 0,
          }}
        >
          Länken fungerade inte?
        </button>
      </div>
    );
  }

  // ===== EXPIRED STATE =====
  if (state === "expired") {
    return (
      <div>
        <h1 style={{ fontSize: 24, marginBottom: 8 }}>
          Länken har gått ut
        </h1>

        <p style={{ color: "#555", marginBottom: 24 }}>
          Av säkerhetsskäl har länken gått ut.
          <br />
          Skicka en ny inloggningslänk nedan.
        </p>

        <button
          onClick={() => setState("sent")}
          style={{
            width: "100%",
            padding: "12px",
            fontSize: 16,
            borderRadius: 8,
            border: "none",
            background: "#111",
            color: "#fff",
            cursor: "pointer",
          }}
        >
          Skicka ny länk
        </button>
      </div>
    );
  }

  // ===== LOGIN STATE =====
  return (
    <div>
      <h1 style={{ fontSize: 24, marginBottom: 8 }}>
        Logga in för att hantera ditt abonnemang
      </h1>

      <p style={{ color: "#555", marginBottom: 24 }}>
        Ange din e-postadress så skickar vi en säker inloggningslänk.
      </p>

      <form
        onSubmit={async (e) => {
          e.preventDefault();

          const email = (
            e.currentTarget.elements.namedItem(
              "email"
            ) as HTMLInputElement
          ).value;

          const { error } =
          await supabase.auth.signInWithOtp({
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
            fontWeight: 500,
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
            padding: "12px",
            fontSize: 16,
            borderRadius: 8,
            border: "1px solid #ccc",
            marginBottom: 16,
          }}
        />

        <button
          type="submit"
          style={{
            width: "100%",
            padding: "12px",
            fontSize: 16,
            borderRadius: 8,
            border: "none",
            background: "#111",
            color: "#fff",
            cursor: "pointer",
          }}
        >
          Skicka inloggningslänk
        </button>
      </form>
    </div>
  );
}
