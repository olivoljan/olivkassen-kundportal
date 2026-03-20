import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import * as Sentry from "@sentry/nextjs";
import { PRICES_ONE_TIME } from "@/lib/stripePriceMap";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-02-25.clover" as any,
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type VolumeKey = "1L" | "2L" | "3L";

const VOLUME_TO_PRICE_KEY: Record<VolumeKey, keyof typeof PRICES_ONE_TIME> = {
  "1L": "1l-once",
  "2L": "2l-once",
  "3L": "3l-once",
};

export async function POST(req: Request) {
  let userId: string | undefined;

  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    userId = user.id;

    const { volume } = await req.json();
    if (!volume || !["1L", "2L", "3L"].includes(volume)) {
      return NextResponse.json({ error: "Invalid volume" }, { status: 400 });
    }

    // Get Stripe customer ID from Supabase profile
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", userId)
      .single();

    if (profileError || !profile?.stripe_customer_id) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }

    const priceKey = VOLUME_TO_PRICE_KEY[volume as VolumeKey];
    const priceId = PRICES_ONE_TIME[priceKey];
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL!;

    // Create Checkout Session — customer prefilled, address prefilled
    const session = await stripe.checkout.sessions.create({
      customer: profile.stripe_customer_id,
      payment_method_types: ["card", "klarna"],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: "payment",
      success_url: `${siteUrl}/mina-sidor?order=success`,
      cancel_url: `${siteUrl}/mina-sidor?order=cancelled`,
      shipping_address_collection: {
        allowed_countries: ["SE"],
      },
      billing_address_collection: "required",
      phone_number_collection: { enabled: true },
      customer_update: {
        address: "auto",
        shipping: "auto",
        name: "auto",
      },
      metadata: {
        userId,
        volume,
        type: "extra_order",
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    console.error("ONE-TIME-ORDER ERROR:", err?.message, err?.raw ?? err);
    Sentry.captureException(err, { tags: { route: "one-time-order", userId } });
    return NextResponse.json({ error: err?.message ?? "Failed to create order" }, { status: 500 });
  }
}