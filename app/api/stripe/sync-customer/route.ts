import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import * as Sentry from "@sentry/nextjs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
);

export async function POST(req: Request) {
  let userId: string | undefined;

  try {
    console.log("🔄 Stripe customer sync started");

    const body = await req.json();
    userId = body.userId;

    if (!userId) {
      return NextResponse.json(
        { error: "Missing userId" },
        { status: 400 }
      );
    }

    /* =========================
       1️⃣ GET SUPABASE PROFILE
    ========================== */

    const { data: profile, error } = await supabase
      .from("profiles")
      .select("email, stripe_customer_id")
      .eq("id", userId)
      .single();

    if (error || !profile) {
      return NextResponse.json(
        { error: "Profile not found" },
        { status: 404 }
      );
    }

    if (profile.stripe_customer_id) {
      return NextResponse.json({ status: "exists" });
    }

    if (!profile.email) {
      return NextResponse.json(
        { error: "Profile email missing" },
        { status: 400 }
      );
    }

    let selectedCustomer: Stripe.Customer | null = null;

    /* =========================
       2️⃣ VERIFY EXISTING ID
    ========================== */

    if (profile.stripe_customer_id) {
      try {
        const existing = await stripe.customers.retrieve(
          profile.stripe_customer_id.trim()
        );

        if (!("deleted" in existing)) {
          selectedCustomer = existing;
          console.log("✅ Existing Stripe customer verified");
        }
      } catch {
        console.log("⚠️ Existing Stripe ID invalid, re-syncing...");
      }
    }

    /* =========================
       3️⃣ SEARCH BY EMAIL IF NEEDED
    ========================== */

    if (!selectedCustomer) {
      const customers = await stripe.customers.list({
        email: profile.email,
        limit: 100,
      });

      if (!customers.data.length) {
        console.log("⚠️ No Stripe customer found, creating new one...");

        selectedCustomer = await stripe.customers.create({
          email: profile.email,
        });
      } else {
        console.log(
          `🔎 Found ${customers.data.length} Stripe customers`
        );

        let bestPriority = 999;

        const priorityMap: Record<string, number> = {
          active: 1,
          trialing: 2,
          canceling: 3,
          paused: 4,
          past_due: 5,
          canceled: 6,
        };

        for (const customer of customers.data) {
          const subs = await stripe.subscriptions.list({
            customer: customer.id,
            status: "all",
            limit: 10,
          });

          if (!subs.data.length) continue;

          for (const sub of subs.data) {
            let status: string = sub.status;

            if (sub.pause_collection) status = "paused";
            if (sub.cancel_at_period_end) status = "canceling";

            const priority = priorityMap[status] ?? 999;

            if (priority < bestPriority) {
              bestPriority = priority;
              selectedCustomer = customer;
            }
          }
        }

        // Fallback if customers exist but no subs
        if (!selectedCustomer) {
          selectedCustomer = customers.data[0];
        }
      }
    }

    /* =========================
       4️⃣ SAVE TO SUPABASE
    ========================== */

    if (!selectedCustomer) {
      return NextResponse.json(
        { error: "Unable to resolve Stripe customer" },
        { status: 500 }
      );
    }

    const { error: updateError } = await supabase
      .from("profiles")
      .update({ stripe_customer_id: selectedCustomer.id })
      .eq("id", userId);

    if (updateError) {
      return NextResponse.json(
        { error: "Failed to update Supabase profile" },
        { status: 500 }
      );
    }

    console.log("✅ Stripe customer synced:", selectedCustomer.id);

    return NextResponse.json({
      status: "synced",
      stripe_customer_id: selectedCustomer.id,
    });

  } catch (err: any) {
    console.error("💥 Sync error:", err);
    Sentry.captureException(err, {
      extra: {
        userId,
        route: "/api/stripe/sync-customer",
      },
    });
    return NextResponse.json(
      { error: err.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}