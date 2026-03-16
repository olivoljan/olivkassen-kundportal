import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);

export async function POST(req: NextRequest) {
  let userId: string | undefined;

  try {
    const body = await req.json();
    userId = body.userId;
    const { undo } = body;

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

    /* =========================
       FETCH SUBSCRIPTIONS SAFELY
    ========================== */

    const subscriptions = await stripe.subscriptions.list({
      customer: profile.stripe_customer_id,
      status: "all",
      limit: 10,
    });

    if (!subscriptions.data.length) {
      return NextResponse.json(
        { error: "No subscription found" },
        { status: 400 }
      );
    }

    // Prevent multiple active subscriptions
    const activeSubs = subscriptions.data.filter(
      sub =>
        sub.status === "active" ||
        sub.status === "trialing" ||
        sub.status === "past_due"
    );

    if (activeSubs.length > 1) {
      console.error("Multiple active subscriptions detected");
      return NextResponse.json(
        { error: "Subscription conflict" },
        { status: 500 }
      );
    }

    const subscription = subscriptions.data.find(
      sub =>
        sub.status === "active" ||
        sub.status === "trialing" ||
        sub.status === "past_due" ||
        sub.cancel_at_period_end === true
    );

    if (!subscription) {
      return NextResponse.json(
        { error: "No valid subscription found" },
        { status: 400 }
      );
    }

    const scheduleId = typeof subscription.schedule === "string"
      ? subscription.schedule
      : (subscription.schedule as any)?.id ?? null;

    /* =========================
       UNDO CANCEL
    ========================== */

    if (undo) {
      if (scheduleId) {
        await stripe.subscriptionSchedules.update(scheduleId, {
          end_behavior: "release",
        });
      } else {
        await stripe.subscriptions.update(subscription.id, {
          cancel_at_period_end: false,
        });
      }

      return NextResponse.json({ status: "active" });
    }

    /* =========================
       CANCEL AT PERIOD END
    ========================== */

    if (scheduleId) {
      await stripe.subscriptionSchedules.update(scheduleId, {
        end_behavior: "cancel",
      });
    } else {
      await stripe.subscriptions.update(subscription.id, {
        cancel_at_period_end: true,
      });
    }

    return NextResponse.json({
      status: "canceling",
    });

  } catch (err: any) {
    console.error("CANCEL ERROR:", err);
    console.error("CANCEL ERROR DETAILS:", {
      message: err?.message,
      type: err?.type,
      code: err?.code,
      raw: err?.raw,
    });
    Sentry.captureException(err, {
      extra: {
        userId,
        route: "/api/stripe/cancel",
      },
    });
    return NextResponse.json(
      { error: err.message || "Cancel failed" },
      { status: 500 }
    );
  }
}