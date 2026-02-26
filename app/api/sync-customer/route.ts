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
    console.log("🔄 Sync started");

    const { userId } = await req.json();

    if (!userId) {
      console.error("❌ Missing userId");
      return NextResponse.json(
        { error: "Missing userId" },
        { status: 400 }
      );
    }

    // 1️⃣ Get profile
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("email, stripe_customer_id")
      .eq("id", userId)
      .single();

    if (profileError || !profile) {
      console.error("❌ Profile not found:", profileError);
      return NextResponse.json(
        { error: "Profile not found" },
        { status: 404 }
      );
    }

    console.log("👤 Profile email:", profile.email);

    // 2️⃣ If already synced → stop
    if (profile.stripe_customer_id) {
      console.log("✅ Already synced:", profile.stripe_customer_id);
      return NextResponse.json({ status: "already_synced" });
    }

    // 3️⃣ Search Stripe customer by email
    console.log("🔍 Searching Stripe by email...");

    const customers = await stripe.customers.search({
      query: `email:'${profile.email}'`,
      limit: 1,
    });

    if (customers.data.length === 0) {
      console.warn("🚫 No Stripe customer found for:", profile.email);
      return NextResponse.json(
        {
          error:
            "This email is not associated with an active subscription.",
        },
        { status: 403 }
      );
    }

    const customer = customers.data[0];

    console.log("🎯 Stripe customer found:", customer.id);

    // 4️⃣ Save stripe_customer_id
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ stripe_customer_id: customer.id })
      .eq("id", userId);

    if (updateError) {
      console.error("❌ Failed to update profile:", updateError);
      return NextResponse.json(
        { error: "Failed to save Stripe ID" },
        { status: 500 }
      );
    }

    console.log("✅ Sync successful");

    return NextResponse.json({
      status: "synced",
      stripe_customer_id: customer.id,
    });

  } catch (err: any) {
    console.error("💥 Sync error:", err);
    return NextResponse.json(
      { error: err.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}