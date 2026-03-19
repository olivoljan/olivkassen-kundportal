import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);

export async function POST(req: NextRequest) {
  let email: string | undefined;
  try {
    const body = await req.json();
    email = body.email;

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const customers = await stripe.customers.list({ email, limit: 1 });

    if (customers.data.length === 0) {
      return NextResponse.json({ found: false });
    }

    return NextResponse.json({ found: true });
  } catch (err: any) {
    console.error("CHECK-EMAIL ERROR:", err);
    Sentry.captureException(err, {
      extra: {
        email,
        route: "/api/stripe/check-email",
      },
    });
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
