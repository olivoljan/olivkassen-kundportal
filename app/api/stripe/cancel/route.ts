import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
});

export async function POST(req: NextRequest) {
  try {
    const { userId, undo } = await req.json();

    if (!userId) {
      return NextResponse.json(
        { error: "No userId provided" },
        { status: 400 }
      );
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
      return NextResponse.json(
        { error: "Stripe customer not found" },
        { status: 400 }
      );
    }

    // Get latest subscription (any status)
    const subscriptions = await stripe.subscriptions.list({
      customer: profile.stripe_customer_id,
      status: "all",
      limit: 1,
    });

    if (!subscriptions.data.length) {
      return NextResponse.json(
        { error: "No subscription found" },
        { status: 400 }
      );
    }

    const subscription = subscriptions.data[0];

    /* =========================
       UNDO CANCEL
    ========================== */
    if (undo) {
      const updated = await stripe.subscriptions.update(subscription.id, {
        cancel_at_period_end: false,
      });

      return NextResponse.json({
        status: updated.status,
      });
    }

    /* =========================
       CANCEL AT PERIOD END
    ========================== */

    const updated = await stripe.subscriptions.update(subscription.id, {
      cancel_at_period_end: true,
    });

    return NextResponse.json({
      status: "canceling",
      cancel_at_period_end: updated.cancel_at_period_end ?? true,
    });

  } catch (err: any) {
    console.error("CANCEL ERROR:", err);

    return NextResponse.json(
      { error: err.message || "Cancel failed" },
      { status: 500 }
    );
  }
}