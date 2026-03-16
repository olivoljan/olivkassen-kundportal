import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import * as Sentry from "@sentry/nextjs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);

export async function POST(req: NextRequest) {
  let userId: string | undefined;

  try {
    const body = await req.json();
    userId = body.userId;

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
       FETCH SUBSCRIPTIONS
       EXPAND PRODUCT METADATA
    ========================== */

    const subscriptions = await stripe.subscriptions.list({
      customer: profile.stripe_customer_id,
      status: "all",
      expand: ["data.items.data.price", "data.schedule"],
      limit: 10,
    });

    if (!subscriptions.data.length) {
      return NextResponse.json({ status: "none" });
    }

    const subscription = subscriptions.data.find(
      sub =>
        sub.status === "active" ||
        sub.status === "trialing" ||
        sub.status === "past_due" ||
        sub.cancel_at_period_end === true
    );

    if (!subscription) {
      return NextResponse.json({ status: "none" });
    }

    const fullSubscription = await stripe.subscriptions.retrieve(subscription.id);
    const rawSub = fullSubscription as any;

    const item = subscription.items.data[0];

    // Run product, scheduled price (if needed), and customer in parallel
    const productId = typeof item.price.product === "string"
      ? item.price.product
      : (item.price.product as any).id;

    const scheduleObj = (subscription as any).schedule;
    const scheduledPriceId = (
      scheduleObj &&
      typeof scheduleObj === "object" &&
      Array.isArray(scheduleObj.phases) &&
      scheduleObj.phases.length > 0
    )
      ? scheduleObj.phases[scheduleObj.phases.length - 1]?.items?.[0]?.price
      : null;

    const [product, scheduledPrice, customer] = await Promise.all([
      stripe.products.retrieve(productId),
      scheduledPriceId && typeof scheduledPriceId === "string" && scheduledPriceId !== item.price.id
        ? stripe.prices.retrieve(scheduledPriceId)
        : Promise.resolve(null),
      stripe.customers.retrieve(profile.stripe_customer_id),
    ]);

    const volume = product.metadata?.volume ?? null;

    let displayIntervalCount: number | null = item.price.recurring?.interval_count ?? null;
    let displayInterval: string | null = item.price.recurring?.interval ?? null;
    let displayPriceId: string = item.price.id;

    if (scheduledPrice) {
      displayIntervalCount = scheduledPrice.recurring?.interval_count ?? displayIntervalCount;
      displayInterval = scheduledPrice.recurring?.interval ?? displayInterval;
      displayPriceId = scheduledPriceId as string;
    }

    /* =========================
       DETERMINE STATUS
    ========================== */

    let status: string = subscription.status;

    if (subscription.pause_collection) {
      status = "paused";
    }

    if (subscription.cancel_at_period_end) {
      status = "canceling";
    }

    // Check if schedule has end_behavior = "cancel" (scheduled cancellation)
    if (
      scheduleObj &&
      typeof scheduleObj === "object" &&
      scheduleObj.end_behavior === "cancel"
    ) {
      status = "canceling";
    }

    if (subscription.status === "canceled") {
      status = "canceled";
    }

    /* =========================
       CURRENT PERIOD END
    ========================== */

    let currentPeriodEnd: number | null =
      typeof rawSub.current_period_end === "number"
        ? rawSub.current_period_end
        : typeof rawSub.current_period_end === "string"
        ? parseInt(rawSub.current_period_end, 10)
        : null;

    // For scheduled subscriptions, use the last phase end_date
    // as that represents the actual next delivery date
    if (scheduleObj && typeof scheduleObj === "object" && Array.isArray(scheduleObj.phases)) {
      const now = Math.floor(Date.now() / 1000);
      const currentPhase = scheduleObj.phases.find(
        (p: any) => p.start_date <= now && p.end_date >= now
      );
      if (currentPhase?.end_date) {
        currentPeriodEnd = currentPhase.end_date;
      }
    }

    /* =========================
       RETURN CLEAN DATA
    ========================== */

    return NextResponse.json({
      status,

      // Stripe data
      price_id: displayPriceId,
      interval: displayInterval,
      interval_count: displayIntervalCount,
      amount: item.price.unit_amount ?? null,
      currency: item.price.currency ?? null,
      current_period_end: currentPeriodEnd,

      // Product data
      product_name: null,
      volume,

      // Customer info (optional)
      customer_name: subscription.customer ?? null,
      schedule: subscription.schedule ? true : null,
      address:
        (customer as Stripe.Customer).shipping?.address ??
        (customer as Stripe.Customer).address ??
        null,
    });

  } catch (err: any) {
    console.error("SUBSCRIPTION ERROR:", err);
    Sentry.captureException(err, {
      extra: {
        userId,
        route: "/api/stripe/subscription",
      },
    });
    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    );
  }
}