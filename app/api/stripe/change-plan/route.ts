import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { LIVE_PRICES } from "@/lib/stripePriceMap";

const ALL_LIVE_PRICES: Record<string, string> = {
  ...LIVE_PRICES,
  "3l-1m-legacy": "price_1Qzj8gClYp4p5ca6GDHQUs5y",
  "3l-3m-legacy": "price_1QzjA6ClYp4p5ca6pH19JVGW",
  "3l-6m-legacy": "price_1QzjCvClYp4p5ca6PSC6gPsT",
  "2l-1m-legacy": "price_1RAXleClYp4p5ca6sC7VlVmq",
  "2l-3m-legacy": "price_1RAXUSClYp4p5ca6cgMVvaZa",
  "2l-6m-legacy": "price_1RAXZyClYp4p5ca6IheU4vvv",
  "1l-1m-legacy": "price_1R9BoFClYp4p5ca60D7yhTMK",
  "1l-3m-legacy": "price_1R9QksClYp4p5ca6d8QIyIbX",
  "1l-6m-legacy": "price_1R9QWrClYp4p5ca6NfiKoEvX",
};

const DEBUG = true;

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  let userId: string | undefined;

  try {
    const body = await req.json();
    userId = body.userId;
    const { interval } = body;

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
        expand: ["items.data.price", "schedule", "latest_invoice"],
      }
    ) as any;

    if (DEBUG) console.log("SUB STATUS", subscription.status);
    if (DEBUG) console.log("ANCHOR", subscription.billing_cycle_anchor);
    if (DEBUG) console.log("START", subscription.start_date);

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

    const scheduleObj =
      typeof subscription.schedule === "object" && subscription.schedule !== null
        ? subscription.schedule
        : null;

    const scheduledIntervalCount = scheduleObj?.phases?.length
      ? scheduleObj.phases[scheduleObj.phases.length - 1]?.items?.[0]?.price
        ? await stripe.prices
            .retrieve(scheduleObj.phases[scheduleObj.phases.length - 1].items[0].price)
            .then((p) => p.recurring?.interval_count ?? currentIntervalCount)
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

    let resolvedNewPriceId: string | null = newPrice?.id ?? null;

    if (!resolvedNewPriceId) {
      const product = (await stripe.products.retrieve(productId)) as any;
      const volume: string = (product.metadata?.volume ?? "").toLowerCase();
      if (volume) {
        const legacyKey = `${volume}-${interval}-legacy`;
        resolvedNewPriceId = ALL_LIVE_PRICES[legacyKey] ?? null;
      }
    }

    if (!resolvedNewPriceId) {
      return NextResponse.json(
        {
          error:
            "This subscription cannot be changed to the selected billing interval.",
        },
        { status: 400 }
      );
    }

    const resolvedNewPrice = newPrice ?? { id: resolvedNewPriceId };

    /* ================= RATE LIMITING ================= */

    const now = Math.floor(Date.now() / 1000);

    const TEST_EMAILS = (process.env.TEST_EMAILS ?? "").split(",").map((e) => e.trim());
    const customer = (await stripe.customers.retrieve(customerId)) as Stripe.Customer;
    const isTestUser = TEST_EMAILS.includes((customer as any).email ?? "");

    if (!isTestUser) {
      const meta = subscription.metadata ?? {};
      const windowStart = parseInt(meta.plan_change_window_start ?? "0");
      const changeCount = parseInt(meta.plan_change_count ?? "0");
      const windowDuration = 24 * 60 * 60;
      const withinWindow = now - windowStart < windowDuration;
      const limitReached = withinWindow && changeCount >= 2;

      if (limitReached) {
        return NextResponse.json(
          {
            error:
              "Du har bytt abonnemang 2 gånger idag. Vänta till imorgon för att göra fler ändringar.",
          },
          { status: 429 }
        );
      }
    }

    /* ================= PERIOD SOURCE (Bug 1 fix) =================
       Stripe API 2026-02-25.clover removed current_period_end.
       - periodStart: use billing_cycle_anchor (per docs)
       - periodEnd:   use upcoming invoice next_payment_attempt
    ================================================================ */

    const periodStart = subscription.billing_cycle_anchor;

    const upcomingInvoice = await stripe.invoices
      .createPreview({ customer: customerId, subscription: subscription.id })
      .catch(() => null);

    const periodEnd: number =
      (upcomingInvoice as any)?.next_payment_attempt ??
      (upcomingInvoice as any)?.due_date ??
      // Fallback: anchor + current interval in seconds (last resort only)
      periodStart + currentIntervalCount * 30 * 24 * 60 * 60;

    if (DEBUG) console.log("periodStart (anchor)", periodStart);
    if (DEBUG) console.log("periodEnd (upcoming invoice)", periodEnd);

    /* ================= FORWARD LOGIC ================= */

    const existingScheduleId =
      typeof subscription.schedule === "string"
        ? subscription.schedule
        : subscription.schedule?.id ?? null;

    const isForward = targetIntervalCount > effectiveIntervalCount;

    let newEnd: number | null = null;

    if (isForward) {
      const totalCurrentPeriod = Math.max(periodEnd - periodStart, 1);
      const remainingTime = periodEnd - now;
      const usedTime = totalCurrentPeriod - remainingTime;
      const newPeriodSeconds =
        totalCurrentPeriod * (targetIntervalCount / effectiveIntervalCount);
      const newRemaining = newPeriodSeconds - usedTime;
      newEnd = now + Math.max(newRemaining, 1);

      if (DEBUG) console.log("totalCurrentPeriod", totalCurrentPeriod);
      if (DEBUG) console.log("usedTime", usedTime);
      if (DEBUG) console.log("newPeriodSeconds", newPeriodSeconds);
      if (DEBUG) console.log("newEnd", newEnd);
    }

    if (DEBUG) console.log("targetIntervalCount", targetIntervalCount);
    if (DEBUG) console.log("effectiveIntervalCount", effectiveIntervalCount);
    if (DEBUG) console.log("isForward", isForward);
    if (DEBUG) console.log("existingScheduleId", existingScheduleId);

    /* ================= FORWARD UPGRADE ================= */

    if (isForward && newEnd) {
      if (DEBUG) console.log("FORWARD UPGRADE");

      // Bug 2 fix: always update schedule with recomputed phases,
      // whether one already exists or needs to be created.
      // PRD edge case: "Forward inside existing schedule phase —
      // Must recompute based on current period start."

      if (existingScheduleId) {
        if (DEBUG) console.log("UPDATING EXISTING SCHEDULE", existingScheduleId);

        await stripe.subscriptionSchedules.update(existingScheduleId, {
          end_behavior: "release",
          phases: [
            {
              start_date: periodStart,
              end_date: Math.round(newEnd),
              items: [{ price: item.price.id, quantity: 1 }],
              proration_behavior: "none" as Stripe.SubscriptionSchedule.Phase.ProrationBehavior,
            },
            {
              start_date: Math.round(newEnd),
              items: [{ price: resolvedNewPrice.id, quantity: 1 }],
              proration_behavior: "none" as Stripe.SubscriptionSchedule.Phase.ProrationBehavior,
            },
          ],
        });
      } else {
        if (DEBUG) console.log("CREATING NEW SCHEDULE");

        // Bug 4 fix: clear cancel_at_period_end before attaching schedule.
        // Locked rule: "cancel_at_period_end is always removed when changing plan."
        if (subscription.cancel_at_period_end) {
          await stripe.subscriptions.update(subscription.id, {
            cancel_at_period_end: false,
            payment_behavior: "default_incomplete" as any,
          });
        }

        const schedule = await stripe.subscriptionSchedules.create({
          from_subscription: subscription.id,
        });

        if (DEBUG) console.log("SCHEDULE CREATED", schedule.id);

        await stripe.subscriptionSchedules.update(schedule.id, {
          end_behavior: "release",
          phases: [
            {
              start_date: periodStart,
              end_date: Math.round(newEnd),
              items: [{ price: item.price.id, quantity: 1 }],
              proration_behavior: "none" as Stripe.SubscriptionSchedule.Phase.ProrationBehavior,
            },
            {
              start_date: Math.round(newEnd),
              items: [{ price: resolvedNewPrice.id, quantity: 1 }],
              proration_behavior: "none" as Stripe.SubscriptionSchedule.Phase.ProrationBehavior,
            },
          ],
        });
      }
    }

    /* ================= DOWNGRADE / SAME LEVEL ================= */

    else if (!isForward) {
      if (DEBUG) console.log("DOWNGRADE / SAME LEVEL");

      if (existingScheduleId) {
        await stripe.subscriptionSchedules.release(existingScheduleId);
      }

      const isIntervalChange = targetIntervalCount !== currentIntervalCount;

      await stripe.subscriptions.update(subscription.id, {
        items: [{ id: item.id, price: resolvedNewPrice.id }],
        proration_behavior: "none",
        cancel_at_period_end: false,      // Bug 4: always clear on change
        payment_behavior: "default_incomplete" as any,  // Klarna safety
        ...(isIntervalChange ? {} : { billing_cycle_anchor: "unchanged" as any }),
      });

      // Void any open invoice created by the plan change
      const openInvoices = await stripe.invoices.list({
        subscription: subscription.id,
        limit: 5,
      });

      for (const invoice of openInvoices.data) {
        if (invoice.status === "open") {
          await stripe.invoices.voidInvoice(invoice.id);
        }
      }
    }

    /* ================= RATE LIMIT METADATA UPDATE ================= */

    // Bug 3 fix: include payment_behavior on this update too,
    // so Stripe never attempts an immediate Klarna charge.
    if (!isTestUser) {
      const meta = subscription.metadata ?? {};
      const windowStart = parseInt(meta.plan_change_window_start ?? "0");
      const changeCount = parseInt(meta.plan_change_count ?? "0");
      const withinWindow = now - windowStart < 24 * 60 * 60;
      const newCount = withinWindow ? changeCount + 1 : 1;
      const newWindowStart = withinWindow ? windowStart : now;

      await stripe.subscriptions.update(subscription.id, {
        payment_behavior: "default_incomplete" as any,  // Klarna safety
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