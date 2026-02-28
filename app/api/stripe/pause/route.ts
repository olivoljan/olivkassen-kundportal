import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);

export async function POST(req: NextRequest) {
  try {
    const { userId } = await req.json();

    if (!userId) {
      return NextResponse.json({ error: "No userId" }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL as string,
      process.env.SUPABASE_SERVICE_ROLE_KEY as string
    );

    const { data: profile } = await supabase
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", userId)
      .single();

    if (!profile?.stripe_customer_id) {
      return NextResponse.json({ error: "No customer" }, { status: 400 });
    }

    const subscriptions = await stripe.subscriptions.list({
      customer: profile.stripe_customer_id,
      status: "all",
      limit: 1,
    });

    if (!subscriptions.data.length) {
      return NextResponse.json({ error: "No subscription" }, { status: 400 });
    }

    const subscription = subscriptions.data[0];

    let updated;

    if (subscription.pause_collection) {
      // RESUME
      updated = await stripe.subscriptions.update(subscription.id, {
        pause_collection: null,
      });

      return NextResponse.json({ status: "active" });
    } else {
      // PAUSE
      updated = await stripe.subscriptions.update(subscription.id, {
        pause_collection: {
          behavior: "mark_uncollectible",
        },
      });

      return NextResponse.json({ status: "paused" });
    }
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Pause error" }, { status: 500 });
  }
}