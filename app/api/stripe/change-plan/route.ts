import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const DEBUG = true;

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  try {
    const { userId, interval } = await req.json();

    if (!userId || !interval) {
      return NextResponse.json(
        { error: "Missing required data." },
        { status: 400 }
      );
    }

    /* ================= GET CUSTOMER ================= */

    const { data: profile } = await supabase
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", userId)
      .single();

    if (!profile?.stripe_customer_id) {
      return NextResponse.json(
        { error: "Customer not found." },
        { status: 404 }
      );
    }

    const customerId = profile.stripe_customer_id;

/* ================= GET ACTIVE SUBSCRIPTION ================= */

const subscriptions = await stripe.subscriptions.list({
  customer: customerId,
  status: "active",
  limit: 1,
});

if (!subscriptions.data.length) {
  return NextResponse.json(
    { error: "Subscription must be active to change plan." },
    { status: 400 }
  );
}

const subscription = await stripe.subscriptions.retrieve(
  subscriptions.data[0].id,
  {
    expand: ["items.data.price", "schedule", "latest_invoice"]
  }
) as any;

if (DEBUG) console.log("SUB PERIOD", subscription.current_period_start, subscription.current_period_end, subscription.status);
if (DEBUG) console.log("ANCHOR", subscription.billing_cycle_anchor);
if (DEBUG) console.log("START", subscription.start_date);
if (DEBUG) console.log("KEYS", Object.keys(subscription));

/* ================= PERIOD SOURCE ================= */

const periodStart = subscription.billing_cycle_anchor;

if (DEBUG) console.log("period", periodStart);


/* ================= BLOCK IF PAUSED ================= */

if (subscription.pause_collection) {
  return NextResponse.json(
    { error: "Cannot change plan while subscription is paused." },
    { status: 400 }
  );
}

const item = subscription.items.data[0];

if (!item) {
  return NextResponse.json(
    { error: "Subscription item missing." },
    { status: 400 }
  );
}

const currentIntervalCount = item.price.recurring?.interval_count;

if (!currentIntervalCount) {
  return NextResponse.json(
    { error: "Current billing interval not found." },
    { status: 400 }
  );
}

const scheduleObj = typeof subscription.schedule === "object"
  && subscription.schedule !== null
  ? subscription.schedule
  : null;

const scheduledIntervalCount = scheduleObj?.phases?.length
  ? scheduleObj.phases[scheduleObj.phases.length - 1]?.items?.[0]?.price
      ? await stripe.prices.retrieve(
          scheduleObj.phases[scheduleObj.phases.length - 1].items[0].price
        ).then(p => p.recurring?.interval_count ?? currentIntervalCount)
      : currentIntervalCount
  : currentIntervalCount;

const effectiveIntervalCount = scheduledIntervalCount;

    /* ================= FIND TARGET PRICE ================= */

    const productId =
      typeof item.price.product === "string"
        ? item.price.product
        : item.price.product.id;

    const prices = await stripe.prices.list({
      product: productId,
      active: true,
    });

    const intervalMap: Record<string, number> = {
      "1m": 1,
      "3m": 3,
      "6m": 6,
    };

    const targetIntervalCount = intervalMap[interval];

    if (!targetIntervalCount) {
      return NextResponse.json(
        { error: "Invalid billing interval selected." },
        { status: 400 }
      );
    }

    const newPrice = prices.data.find(
      (p) =>
        p.recurring?.interval === "month" &&
        p.recurring?.interval_count === targetIntervalCount
    );

    if (!newPrice) {
      return NextResponse.json(
        {
          error:
            "This subscription cannot be changed to the selected billing interval.",
        },
        { status: 400 }
      );
    }

   /* ================= RATE LIMITING ================= */

const now = Math.floor(Date.now() / 1000);

const TEST_EMAILS = (process.env.TEST_EMAILS ?? "").split(",").map(e => e.trim());
const customer = await stripe.customers.retrieve(customerId) as Stripe.Customer;
const isTestUser = TEST_EMAILS.includes((customer as any).email ?? "");

if (!isTestUser) {
  const meta = subscription.metadata ?? {};
  const windowStart = parseInt(meta.plan_change_window_start ?? "0");
  const changeCount = parseInt(meta.plan_change_count ?? "0");
  const windowDuration = 24 * 60 * 60;

  const withinWindow = (now - windowStart) < windowDuration;
  const limitReached = withinWindow && changeCount >= 2;

  if (limitReached) {
    return NextResponse.json(
      { error: "Du har bytt abonnemang 2 gånger idag. Vänta till imorgon för att göra fler ändringar." },
      { status: 429 }
    );
  }
}

    /* ================= FORWARD LOGIC ================= */

    const existingSchedule =
      typeof subscription.schedule === "string"
        ? subscription.schedule
        : subscription.schedule?.id;

    const isForward =
      targetIntervalCount > effectiveIntervalCount;

    let newEnd: number | null = null;

    if (isForward) {

      const periodStart = subscription.billing_cycle_anchor;
      const anchorDate = new Date(periodStart * 1000);
      anchorDate.setMonth(anchorDate.getMonth() + (item.price.recurring?.interval_count ?? 1));
      const periodEnd = Math.floor(anchorDate.getTime() / 1000);

    
      const totalCurrentPeriod = Math.max(periodEnd - periodStart, 1);
    
      const remainingTime = periodEnd - now;
    
      const usedTime = totalCurrentPeriod - remainingTime;
    
      const newPeriodSeconds =
        totalCurrentPeriod *
        (targetIntervalCount / effectiveIntervalCount);
    
      const newRemaining = newPeriodSeconds - usedTime;
    
      newEnd = now + Math.max(newRemaining, 1);
    }    

    if (DEBUG) console.log("periodStart", periodStart);
    if (DEBUG) console.log("newEnd", newEnd);


    /* ================= FORWARD UPGRADE ================= */

if (DEBUG) console.log("targetIntervalCount", targetIntervalCount);
if (DEBUG) console.log("currentIntervalCount", currentIntervalCount);
if (DEBUG) console.log("isForward", isForward);
if (DEBUG) console.log("newEnd", newEnd);

if (isForward && newEnd) {

  if (DEBUG) console.log("newEnd", newEnd);
  if (DEBUG) console.log("FORWARD UPGRADE");

  if (DEBUG) console.log("EXISTING SCHEDULE", existingSchedule, typeof subscription.schedule);
  if (DEBUG) console.log("RAW SCHEDULE", JSON.stringify(subscription.schedule));

  if (existingSchedule) {
    // Schedule already attached — verify it's active and skip
    if (DEBUG) console.log("SCHEDULE ALREADY EXISTS, SKIPPING UPDATE");
  } else {
    const schedule = await stripe.subscriptionSchedules.create({
      from_subscription: subscription.id,
    });

    if (DEBUG) console.log("SCHEDULE CREATED", schedule.id, "SUB ON SCHEDULE", schedule.subscription);

    await stripe.subscriptionSchedules.update(schedule.id, {
      end_behavior: "release",
      phases: [
        {
          start_date: subscription.billing_cycle_anchor,
          end_date: Math.round(newEnd),
          items: [{ price: item.price.id, quantity: 1 }],
          proration_behavior: "none" as Stripe.SubscriptionSchedule.Phase.ProrationBehavior,
        },
        {
          start_date: Math.round(newEnd),
          items: [{ price: newPrice.id, quantity: 1 }],
          proration_behavior: "none" as Stripe.SubscriptionSchedule.Phase.ProrationBehavior,
        },
      ],
    });
  }
}

/* ================= DOWNGRADE ================= */

else if (!isForward) {
  if (DEBUG) console.log("DOWNGRADE");

  if (existingSchedule) {
    await stripe.subscriptionSchedules.release(existingSchedule);
  }

  await stripe.subscriptions.update(subscription.id, {
    items: [{ id: item.id, price: newPrice.id }],
    proration_behavior: "none",
    cancel_at_period_end: false,
  });
}

if (!isTestUser) {
  const meta = subscription.metadata ?? {};
  const windowStart = parseInt(meta.plan_change_window_start ?? "0");
  const changeCount = parseInt(meta.plan_change_count ?? "0");
  const withinWindow = (now - windowStart) < (24 * 60 * 60);
  const newCount = withinWindow ? changeCount + 1 : 1;
  const newWindowStart = withinWindow ? windowStart : now;

  await stripe.subscriptions.update(subscription.id, {
    metadata: {
      plan_change_count: String(newCount),
      plan_change_window_start: String(newWindowStart),
    },
  });
}

return NextResponse.json({ success: true });

} catch (err) {
console.error("Change plan error:", err);
Sentry.captureException(err, {
  extra: {
    userId,
    route: "/api/stripe/change-plan",
  },
});

return NextResponse.json(
  { error: "Unexpected server error." },
  { status: 500 }
);
}
}