import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);

export async function GET(req: NextRequest) {
  /* =========================
     AUTH — Vercel Cron Secret
  ========================== */

  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = Math.floor(Date.now() / 1000);
  const resumed: string[] = [];
  const skipped: string[] = [];
  const errors: string[] = [];

  try {
    /* =========================
       FETCH ALL PAUSED SUBS
    ========================== */

    let hasMore = true;
    let startingAfter: string | undefined = undefined;

    while (hasMore) {
      const page: Stripe.ApiList<Stripe.Subscription> =
        await stripe.subscriptions.list({
          status: "active",
          limit: 100,
          ...(startingAfter ? { starting_after: startingAfter } : {}),
        });

      for (const sub of page.data) {
        if (!sub.pause_collection) continue;

        const pauseUntil = sub.metadata?.pause_until
          ? parseInt(sub.metadata.pause_until, 10)
          : null;

        // Only resume skip_one pauses that have a pause_until in the past
        if (!pauseUntil || isNaN(pauseUntil)) {
          skipped.push(sub.id); // indefinite pause — leave alone
          continue;
        }

        const buffer = 86400; // 24h buffer
        if (pauseUntil + buffer > now) {
          skipped.push(sub.id); // not yet time to resume
          continue;
        }

        try {
          await stripe.subscriptions.update(sub.id, {
            pause_collection: null,
            metadata: { pause_until: "" },
          });
          resumed.push(sub.id);
          console.log(`Resumed subscription ${sub.id} (pause_until: ${pauseUntil})`);
        } catch (err: any) {
          console.error(`Failed to resume ${sub.id}:`, err.message);
          errors.push(sub.id);
          Sentry.captureException(err, {
            extra: { subscriptionId: sub.id, route: "/api/cron/resume-paused" },
          });
        }
      }

      hasMore = page.has_more;
      if (hasMore && page.data.length > 0) {
        startingAfter = page.data[page.data.length - 1].id;
      }
    }

    console.log(`resume-paused cron: resumed=${resumed.length} skipped=${skipped.length} errors=${errors.length}`);

    return NextResponse.json({ resumed, skipped, errors });

  } catch (err: any) {
    console.error("CRON resume-paused ERROR:", err);
    Sentry.captureException(err, {
      extra: { route: "/api/cron/resume-paused" },
    });
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
