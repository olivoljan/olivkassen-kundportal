"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import { SiteHeader } from "@/app/components/SiteHeader";

export default function Home() {
  const supabase = createClient();

  const [state, setState] = useState<
    "login" | "sent" | "expired"
  >("login");

  return (
    <div className="min-h-screen flex flex-col bg-[#ECE6DF]">

      <SiteHeader />

      <main className="flex-1 flex items-center justify-center px-4">
      <div className="w-full max-w-[420px] bg-card rounded-3xl shadow-sm p-10 space-y-6">

        {/* ===== SENT STATE ===== */}
        {state === "sent" && (
          <>
            <div className="space-y-3">
              <h1 className="text-[40px] font-extrabold tracking-[-1.9px]">
                Kolla din e-post!
              </h1>

              <p className="text-lg text-muted-foreground">
              Vi har skickat en inloggningslänk till din e-postadress. 
Öppna mejlet och klicka på knappen – så är du inloggad. 
Länken fungerar i 60 minuter.
              </p>
            </div>

            <button
              onClick={() => setState("expired")}
              className="text-sm underline underline-offset-4 text-muted-foreground hover:text-foreground transition"
            >
              Fick du inget mejl? Skicka igen
            </button>
          </>
        )}

        {/* ===== EXPIRED STATE ===== */}
        {state === "expired" && (
          <>
            <div className="space-y-3">
              <h1 className="text-[40px] font-extrabold tracking-[-1.9px]">
                Länken har gått ut
              </h1>

              <p className="text-lg text-muted-foreground">
                Av säkerhetsskäl har länken gått ut.
                <br />
                Skicka en ny inloggningslänk nedan.
              </p>
            </div>

            <button
              onClick={() => setState("login")}
              className="w-full bg-black text-white rounded-2xl py-4 font-semibold hover:opacity-90 transition"
            >
              Skicka ny länk
            </button>
          </>
        )}

        {/* ===== LOGIN STATE ===== */}
        {state === "login" && (
          <>
            <div className="space-y-3">
              <h1 className="text-[40px] font-extrabold tracking-[-1.9px]">
                Logga in
              </h1>

              <p className="text-lg text-muted-foreground">
                Ange din e-postadress så skickar vi en säker inloggningslänk.
              </p>
            </div>

            <form
              className="space-y-4"
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
              <div className="space-y-2">
                <label
                  htmlFor="email"
                  className="text-sm font-medium"
                >
                  E-postadress
                </label>

                <input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="din@email.se"
                  required
                  className="w-full rounded-full px-6 py-4 bg-white border border-gray-200 text-base focus:outline-none focus:ring-2 focus:ring-black transition"
                />
              </div>

              <button
                type="submit"
                className="w-full bg-[#1a3300] text-[#ffe95c] rounded-full py-4 px-6 font-semibold hover:opacity-90 transition"
              >
                Skicka inloggningslänk
              </button>
            </form>
          </>
        )}
      </div>
      </main>
    </div>
  );
}