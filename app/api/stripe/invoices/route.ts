import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import Stripe from "stripe";
import { createClient } from "@/lib/supabaseServer";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST() {
  let userId: string | undefined;

  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    userId = user?.id;

    if (!user) {
      return NextResponse.json({ invoices: [] });
    }

    const { data: profile, error } = await supabase
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", user.id)
      .single();

    if (error || !profile?.stripe_customer_id) {
      return NextResponse.json({ invoices: [] });
    }

    // 🔥 Fetch CHARGES instead of invoices
    const charges = await stripe.charges.list({
      customer: profile.stripe_customer_id,
      limit: 10,
    });

    const formatted = charges.data.map((charge) => ({
      id: charge.id,
      short_id: charge.id.slice(-6).toUpperCase(),
      created: charge.created,
      amount_paid: charge.amount,
      receipt_url: charge.receipt_url,
    }));

    return NextResponse.json({ invoices: formatted });

  } catch (err: any) {
    console.error("INVOICES ERROR:", err);
    Sentry.captureException(err, {
      extra: {
        userId,
        route: "/api/stripe/invoices",
      },
    });
    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    );
  }
}