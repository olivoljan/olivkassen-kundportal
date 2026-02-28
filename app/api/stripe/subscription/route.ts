import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);

export async function POST(req: NextRequest) {
  try {
    const { userId } = await req.json();

    if (!userId) {
      return NextResponse.json({ status: "none" });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL as string,
      process.env.SUPABASE_SERVICE_ROLE_KEY as string
    );

    const { data: profile, error } = await supabase
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", userId)
      .single();

    if (error || !profile?.stripe_customer_id) {
      return NextResponse.json({ status: "none" });
    }

        /* =========================
      GET SUBSCRIPTION (ALL)
    ========================== */

    const subscriptions = await stripe.subscriptions.list({
      customer: profile.stripe_customer_id,
      status: "all",
      expand: ["data.items.data.price"],
      limit: 10, // get more than 1
    });

    if (!subscriptions.data.length) {
      return NextResponse.json({ status: "none" });
    }

    /*
      Pick the most relevant subscription:
      - active
      - trialing
      - past_due
      - canceling
      - or most recent
    */

    const subscription =
      subscriptions.data.find(
        (sub) =>
          sub.status === "active" ||
          sub.status === "trialing" ||
          sub.cancel_at_period_end === true
      ) || subscriptions.data[0];

    const item = subscription.items.data[0];

          /* =========================
        DETERMINE STATUS
      ========================== */

      let status: string = subscription.status;

      // Paused
      if (subscription.pause_collection) {
        status = "paused";
      }

      // Canceling at period end
      if (subscription.cancel_at_period_end) {
        status = "canceling";
      }

      // Fully canceled
      if (subscription.status === "canceled") {
        status = "canceled";
      }

    /* =========================
       GET PRODUCT
    ========================== */

    let productName = "Unknown product";

    if (typeof item.price.product === "string") {
      const product = await stripe.products.retrieve(
        item.price.product
      );
      productName = product.name;
    }

    /* =========================
       GET CUSTOMER INFO
    ========================== */

    const customerRaw = await stripe.customers.retrieve(
      profile.stripe_customer_id
    );

    let customer_name = null;
    let customer_address = null;

    if (!("deleted" in customerRaw)) {
      customer_name = customerRaw.name ?? null;
      customer_address = customerRaw.address ?? null;
    }

    /* =========================
       RETURN DATA
    ========================== */

    return NextResponse.json({
      status,
      product: productName,
      interval: item.price.recurring?.interval ?? null,
      interval_count: item.price.recurring?.interval_count ?? null,
      amount: item.price.unit_amount ?? null,
      currency: item.price.currency ?? null,
      current_period_end:
  "current_period_end" in subscription
    ? subscription.current_period_end
    : null,
      customer_name,
      customer_address,
    });

  } catch (err: any) {
    console.error("SUBSCRIPTION ERROR:", err);
    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    );
  }
}