import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL as string,
      process.env.SUPABASE_SERVICE_ROLE_KEY as string
    );

    const { userId } = await req.json();

    if (!userId) {
      return NextResponse.json({ status: "none" });
    }

    const { data: profile, error } = await supabase
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", userId)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!profile?.stripe_customer_id) {
      return NextResponse.json({ status: "none" });
    }

    const subscriptions = await stripe.subscriptions.list({
      customer: profile.stripe_customer_id,
      status: "active",
      expand: ["data.items.data.price"],
    });

    if (!subscriptions.data.length) {
      return NextResponse.json({ status: "none" });
    }

    const subscription = subscriptions.data[0] as any;
const item = subscription.items.data[0];

    // 🔥 fetch product safely
    let productName = "Unknown product";

    if (typeof item.price.product === "string") {
      const product = await stripe.products.retrieve(
        item.price.product
      );
      productName = product.name;
    }

    return NextResponse.json({
      status: subscription.status,
      product: productName,
      interval: item.price.recurring?.interval ?? null,
      interval_count: item.price.recurring?.interval_count ?? null,
      amount: item.price.unit_amount ?? null,
      currency: item.price.currency ?? null,
      current_period_end: subscription.current_period_end ?? null,
    });
  } catch (err: any) {
    console.error("SUBSCRIPTION ERROR:", err);
    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    );
  }
}