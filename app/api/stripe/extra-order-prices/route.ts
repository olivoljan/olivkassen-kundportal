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

export async function GET(req: Request) {
  let userId: string | undefined;

  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    userId = user.id;

    // Fetch all 3 prices in parallel
    const [price1L, price2L, price3L] = await Promise.all([
      stripe.prices.retrieve(PRICES_ONE_TIME["1l-once"]),
      stripe.prices.retrieve(PRICES_ONE_TIME["2l-once"]),
      stripe.prices.retrieve(PRICES_ONE_TIME["3l-once"]),
    ]);

    return NextResponse.json({
      "1L": {
        priceId: price1L.id,
        amount: price1L.unit_amount,
        currency: price1L.currency,
      },
      "2L": {
        priceId: price2L.id,
        amount: price2L.unit_amount,
        currency: price2L.currency,
      },
      "3L": {
        priceId: price3L.id,
        amount: price3L.unit_amount,
        currency: price3L.currency,
      },
    });
  } catch (err) {
    Sentry.captureException(err, { tags: { route: "extra-order-prices", userId } });
    return NextResponse.json({ error: "Failed to fetch prices" }, { status: 500 });
  }
}