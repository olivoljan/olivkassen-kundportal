import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import * as Sentry from "@sentry/nextjs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);

export async function POST(req: NextRequest) {
  try {
    const { userId } = await req.json();

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
        { error: "Customer not found" },
        { status: 400 }
      );
    }

    const returnUrl =
      process.env.NEXT_PUBLIC_SITE_URL
        ? `${process.env.NEXT_PUBLIC_SITE_URL}/mina-sidor`
        : "https://konto.olivkassen.com/mina-sidor";

    const session = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: returnUrl,
    });

    return NextResponse.json({ url: session.url });

  } catch (err: any) {
    console.error("PORTAL ERROR:", err);
    Sentry.captureException(err, {
      extra: {
        userId,
        route: "/api/stripe/portal-session",
      },
    });
    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    );
  }
}