import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  try {
    const { userId } = await req.json();

    if (!userId) {
      return NextResponse.json(
        { error: "Missing userId" },
        { status: 400 }
      );
    }

    // 1️⃣ Get profile
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("email, stripe_customer_id")
      .eq("id", userId)
      .single();

    if (error || !profile) {
      return NextResponse.json(
        { error: "Profile not found" },
        { status: 404 }
      );
    }

    if (!profile.email) {
      return NextResponse.json(
        { error: "Profile email missing" },
        { status: 400 }
      );
    }

    let customer;

    // 2️⃣ If we already have customer ID → verify it exists
    if (profile.stripe_customer_id) {
      try {
        customer = await stripe.customers.retrieve(
          profile.stripe_customer_id.trim()
        );

        // If Stripe returns deleted customer object
        if ((customer as any).deleted) {
          customer = null;
        }
      } catch {
        customer = null;
      }
    }

    // 3️⃣ If no valid customer → search by email
    if (!customer) {
      const existing = await stripe.customers.list({
        email: profile.email,
        limit: 1,
      });

      if (existing.data.length > 0) {
        customer = existing.data[0];
      } else {
        customer = await stripe.customers.create({
          email: profile.email,
        });
      }

      // Save correct ID to Supabase
      await supabase
        .from("profiles")
        .update({ stripe_customer_id: customer.id })
        .eq("id", userId);
    }

    return NextResponse.json({
      customerId: customer.id,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}