import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const PUSH_WORKER_URL = Deno.env.get("PUSH_WORKER_URL")!;

/**
 * Transaction Reminders Edge Function
 *
 * Called daily by Cloudflare Worker cron trigger at 8 AM.
 * Finds pending/uncleared transactions older than 3 days and
 * sends reminder notifications to users.
 *
 * Algorithm:
 * 1. Query transactions with:
 *    - cleared = false
 *    - date < (today - 3 days)
 * 2. Group transactions by owner_user_id
 * 3. For each user:
 *    a. Fetch user's push subscriptions (all devices)
 *    b. Send summary notification: "You have N pending transactions"
 *
 * This helps users stay on top of transactions that need clearing
 * (e.g., pending bank transfers, receipts to reconcile).
 */
Deno.serve(async (req) => {
  try {
    // Calculate date threshold (3 days ago)
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    const thresholdDate = threeDaysAgo.toISOString().split("T")[0]; // YYYY-MM-DD

    // Get pending transactions older than 3 days
    const { data: pendingTransactions, error: txnError } = await supabase
      .from("transactions")
      .select("id, description, amount_cents, date, owner_user_id, account:accounts(name)")
      .eq("cleared", false)
      .lt("date", thresholdDate)
      .order("date", { ascending: true })
      .limit(100); // Limit to prevent overwhelming queries

    if (txnError) {
      console.error("Error fetching pending transactions:", txnError);
      return new Response(JSON.stringify({ error: txnError.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!pendingTransactions || pendingTransactions.length === 0) {
      return new Response(JSON.stringify({ message: "No pending transactions to remind about" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    console.log(`Processing ${pendingTransactions.length} pending transactions`);

    // Group transactions by user
    const userTransactions = pendingTransactions.reduce(
      (acc, txn) => {
        const userId = txn.owner_user_id;
        if (!acc[userId]) {
          acc[userId] = [];
        }
        acc[userId].push(txn);
        return acc;
      },
      {} as Record<string, any[]>
    );

    // Track notification results
    const results: {
      userId: string;
      pendingCount: number;
      notifications: number;
      errors: string[];
    }[] = [];

    // Send reminders per user
    for (const [userId, transactions] of Object.entries(userTransactions)) {
      // Get user's push subscriptions (all devices)
      const { data: subscriptions, error: subError } = await supabase
        .from("push_subscriptions")
        .select("endpoint, p256dh, auth")
        .eq("user_id", userId);

      if (subError) {
        console.error(`Error fetching subscriptions for user ${userId}:`, subError);
        continue;
      }

      if (!subscriptions || subscriptions.length === 0) {
        console.log(`No push subscriptions for user ${userId}`);
        continue;
      }

      // Format notification message
      const count = transactions.length;
      const message =
        count === 1
          ? `You have 1 pending transaction from ${transactions[0].date}`
          : `You have ${count} pending transactions (oldest: ${transactions[0].date})`;

      const errors: string[] = [];
      let sentCount = 0;

      // Send to all user's devices
      for (const sub of subscriptions) {
        try {
          const response = await fetch(PUSH_WORKER_URL, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            },
            body: JSON.stringify({
              subscription: {
                endpoint: sub.endpoint,
                keys: {
                  p256dh: sub.p256dh,
                  auth: sub.auth,
                },
              },
              title: "Pending Transactions",
              body: message,
              data: {
                tag: "pending-transactions",
                url: "/transactions?status=pending",
                count,
              },
            }),
          });

          if (response.ok) {
            sentCount++;
          } else {
            const errorText = await response.text();
            errors.push(`Device notification failed: ${errorText}`);
          }
        } catch (error) {
          errors.push(`Failed to send to device: ${error.message}`);
          console.error("Notification send error:", error);
        }
      }

      results.push({
        userId,
        pendingCount: count,
        notifications: sentCount,
        errors,
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        usersNotified: Object.keys(userTransactions).length,
        totalPending: pendingTransactions.length,
        results,
      }),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Transaction reminders error:", error);
    return new Response(
      JSON.stringify({
        error: error.message || "Unknown error",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});
