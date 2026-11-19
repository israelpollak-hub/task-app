import { createClient } from "jsr:@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@12.0.0";
import { SUPABASE_SECRET_KEY } from "../_shared/supabaseKeys.ts";
import { Plan, planForSubscription } from "../_shared/plans.ts";

// Load environment variables
const WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET");
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") as string;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";

// The Stripe price of each paid plan. The plan a user gets depends on the price they pay.
const PLAN_PRICES = {
  premium: Deno.env.get("STRIPE_PRICE_ID"),
  pro: Deno.env.get("STRIPE_PRO_PRICE_ID"),
};

console.log("🌍 Stripe Webhook is running...");

const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
});

// This is needed in order to use the Web Crypto API in Deno.
const cryptoProvider = Stripe.createSubtleCryptoProvider();

Deno.serve(async (req) => {
  const signature = req.headers.get("Stripe-Signature");
  const body = await req.text();

  try {
    const event = await stripe.webhooks.constructEventAsync(
      body,
      signature!,
      WEBHOOK_SECRET,
      undefined,
      cryptoProvider
    );

    console.log(`Received event: ${event.type}`);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Save the user's plan (the database sets the task limit from the plan).
    const setPlan = async (customerId: string, plan: Plan) => {
      const { error } = await supabase
        .from("profiles")
        .update({
          subscription_plan: plan,
          updated_at: new Date().toISOString(),
        })
        .eq("stripe_customer_id", customerId);
      if (error) throw error;
      console.log(`✅ Plan of customer ${customerId} is now ${plan}`);
    };

    // Ask Stripe for the subscription as it is NOW (the event may be old or out of
    // order) and set the plan from its price and status.
    const syncPlanFromSubscription = async (subscriptionId: string) => {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      const plan = planForSubscription(subscription, PLAN_PRICES);
      if (!plan) {
        console.log(
          `No plan change for subscription ${subscriptionId} (status ${subscription.status})`
        );
        return;
      }
      await setPlan(subscription.customer as string, plan);
    };

    switch (event.type) {
      // A new subscription is paid through Stripe Checkout.
      case "checkout.session.completed": {
        const session = event.data.object;
        if (session.subscription) {
          await syncPlanFromSubscription(session.subscription as string);
        }
        break;
      }

      // A subscription is created, or changed: for example, the customer switches
      // from Premium to Pro (or back) in the customer portal.
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        await syncPlanFromSubscription(event.data.object.id);
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        await setPlan(subscription.customer as string, "free");
        break;
      }
    }

    console.log("✅ Webhook processed successfully");
    return new Response(JSON.stringify({ received: true }));
  } catch (error) {
    console.error("Error in stripe-webhook:", error.message);
    // A non-200 answer makes Stripe try again later.
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
    });
  }
});
