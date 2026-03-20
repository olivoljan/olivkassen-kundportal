import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import * as Sentry from "@sentry/nextjs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-02-25.clover" as any,
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL!;

    const volumeNames: Record<string, string> = {
      "1L": "1x1L premium olivolja — Extra beställning",
      "2L": "2x1L premium olivolja — Extra beställning",
      "3L": "3x1L premium olivolja — Extra beställning",
    };

    const volumeImages: Record<string, string> = {
      "1L": "https://cdn.prod.website-files.com/676d596f9615722376dfe2fc/69bda36ba5276a17cef8b809_1x.png",
      "2L": "https://cdn.prod.website-files.com/676d596f9615722376dfe2fc/69bda36c531d1e781a4bf7fd_2x.png",
      "3L": "https://cdn.prod.website-files.com/676d596f9615722376dfe2fc/69bda36c7fc348f9c9652b39_3x.png",
    };

    // NOTE: Prices are in öre (SEK × 100). Update here when prices change.
    // Also update the price display text in AccountClient.tsx to match.
    const volumePrices: Record<string, number> = {
      "1L": 30800, // 308 SEK (249 kr olivolja + 59 kr frakt)
      "2L": 50700, // 507 SEK (448 kr olivolja + 59 kr frakt)
      "3L": 65700, // 657 SEK (598 kr olivolja + 59 kr frakt)
    };

    // Create Checkout Session — customer prefilled, address prefilled
    const session = await stripe.checkout.sessions.create({
      customer: profile.stripe_customer_id,
      payment_method_types: ["card", "klarna"],
      line_items: [
        {
          price_data: {
            currency: "sek",
            unit_amount: volumePrices[volume],
            product_data: {
              name: volumeNames[volume],
              description:
                "100% Jungfruolivolja av högsta kvalitet från Kreta – pressad av handplockade Koroneikioliver med låg syrahalt, rik på smak och naturliga antioxidanter.",
              images: [volumeImages[volume]],
            },
          },
          quantity: 1,
        },
      ],
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