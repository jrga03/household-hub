import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const PUSH_WORKER_URL = Deno.env.get("PUSH_WORKER_URL")!;

/**
 * Budget Alerts Edge Function
 *
 * Called daily by Cloudflare Worker cron trigger at 9 AM.
 * Checks all budgets and sends push notifications to users whose
 * spending has reached or exceeded 80% of their budget limit.
 *
 * Algorithm:
 * 1. Call check_budget_thresholds() RPC function
 * 2. For each budget >= 80% threshold:
 *    a. Fetch user's push subscriptions (all devices)
 *    b. Send notification to each device via Cloudflare Worker
 *
 * Budget calculation excludes transfers to avoid double-counting
 * (handled by check_budget_thresholds RPC function).
 */
Deno.serve(async (req) => {
  try {
    // Get all budgets approaching limit (>= 80%)
    const { data: budgets, error: budgetsError } = await supabase.rpc("check_budget_thresholds");

    if (budgetsError) {
      console.error("Error fetching budget thresholds:", budgetsError);
      return new Response(JSON.stringify({ error: budgetsError.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!budgets || budgets.length === 0) {
      return new Response(JSON.stringify({ message: "No budgets at or above 80% threshold" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    console.log(`Processing ${budgets.length} budget alerts`);

    // Track notification results
    const results: {
      userId: string;
      category: string;
      percentage: number;
      notifications: number;
      errors: string[];
    }[] = [];

    for (const budget of budgets) {
      // Get user's push subscriptions (all devices)
      const { data: subscriptions, error: subError } = await supabase
        .from("push_subscriptions")
        .select("endpoint, p256dh, auth")
        .eq("user_id", budget.user_id);

      if (subError) {
        console.error(`Error fetching subscriptions for user ${budget.user_id}:`, subError);
        continue;
      }

      if (!subscriptions || subscriptions.length === 0) {
        console.log(`No push subscriptions for user ${budget.user_id}`);
        continue;
      }

      // Format amount in PHP currency
      const budgetAmountPHP = (budget.amount_cents / 100).toLocaleString("en-PH", {
        style: "currency",
        currency: "PHP",
      });

      const errors: string[] = [];
      let sentCount = 0;

      // Send notification to all user's devices
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
              title: "Budget Alert",
              body: `${budget.category_name}: ${budget.percentage}% of ${budgetAmountPHP} budget used`,
              data: {
                budgetId: budget.id,
                categoryId: budget.category_id,
                percentage: budget.percentage,
                tag: "budget-alert",
                url: "/budgets",
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
        userId: budget.user_id,
        category: budget.category_name,
        percentage: budget.percentage,
        notifications: sentCount,
        errors,
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        budgetsProcessed: budgets.length,
        results,
      }),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Budget alerts error:", error);
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
