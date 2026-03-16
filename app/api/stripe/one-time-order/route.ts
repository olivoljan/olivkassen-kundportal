import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);

export async function POST(req: NextRequest) {
  try {
    const { userId } = await req.json();

    if (!userId) {
      return NextResponse.json({ error: "Missing userId" }, { status: 400 });
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
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }

    const customerId = profile.stripe_customer_id;

    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: "active",
      limit: 1,
    });

    if (!subscriptions.data.length) {
      return NextResponse.json({ error: "No active subscription found" }, { status: 400 });
    }

    const subscription = subscriptions.data[0];

    const pendingItems = await stripe.invoiceItems.list({
      customer: customerId,
      pending: true,
      limit: 10,
    });
    for (const item of pendingItems.data) {
      await stripe.invoiceItems.del(item.id);
    }

    await stripe.invoiceItems.create({
      customer: customerId,
      amount: subscription.items.data[0].price.unit_amount ?? 59800,
      currency: subscription.items.data[0].price.currency ?? "sek",
      description: "Extra beställning",
    });

    const invoice = await stripe.invoices.create({
      customer: customerId,
      collection_method: "send_invoice",
      days_until_due: 3,
      auto_advance: false,
    });

    await stripe.invoices.finalizeInvoice(invoice.id);
    await stripe.invoices.sendInvoice(invoice.id);

    return NextResponse.json({ success: true });

  } catch (err: any) {
    console.error("ONE-TIME-ORDER ERROR:", err?.message, err?.raw ?? err);
    Sentry.captureException(err, {
      extra: {
        userId,
        route: "/api/stripe/one-time-order",
      },
    });
    return NextResponse.json(
      { error: "Betalningen misslyckades" },
      { status: 500 }
    );
  }
}
