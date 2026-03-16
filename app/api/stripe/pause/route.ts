import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);

export async function POST(req: NextRequest) {
  try {
    const { userId, pauseType } = await req.json();

    if (!userId) {
      return NextResponse.json(
        { error: "No userId" },
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

    /* =========================
       PAUSE / RESUME
    ========================== */

    if (subscription.pause_collection) {
      // RESUME
      await stripe.subscriptions.update(subscription.id, {
        pause_collection: null,
      });

      return NextResponse.json({ status: "active" });
    } else {
      // PAUSE
      if (pauseType === "skip_one") {
        if (subscription.schedule) {
          return NextResponse.json(
            {
              error: "skip_one_blocked_by_schedule",
              message: "Din leveransfrekvens ändrades nyligen och din nya period har inte börjat än. Du kan inte hoppa över en leverans just nu. Du kan däremot pausa abonnemanget tillsvidare.",
            },
            { status: 400 }
          );
        }

        await stripe.subscriptions.update(subscription.id, {
          pause_collection: { behavior: "void" },
          metadata: { pause_until: String((subscription as any).current_period_end) },
        });
      } else {
        // indefinite
        await stripe.subscriptions.update(subscription.id, {
          pause_collection: { behavior: "void" },
        });
      }

      return NextResponse.json({ status: "paused" });
    }

  } catch (err) {
    console.error("PAUSE ERROR:", err);
    Sentry.captureException(err, {
      extra: {
        userId,
        route: "/api/stripe/pause",
      },
    });
    return NextResponse.json(
      { error: "Pause error" },
      { status: 500 }
    );
  }
}