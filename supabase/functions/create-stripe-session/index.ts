import { createClient } from "jsr:@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@12.0.0";
import { SUPABASE_SECRET_KEY } from "../_shared/supabaseKeys.ts";
import { isPaidPlan } from "../_shared/plans.ts";

// Load environment variables
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") as string;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";

// The Stripe price of each paid plan.
const PRICE_BY_PLAN: Record<"premium" | "pro", string | undefined> = {
  premium: Deno.env.get("STRIPE_PRICE_ID"),
  pro: Deno.env.get("STRIPE_PRO_PRICE_ID"),
};

const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: "2023-10-16",
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    console.log("🔄 Authenticating user...");
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(
      req.headers.get("Authorization")?.split(" ")[1] ?? ""
    );

    if (authError) {
      throw new Error(`Authentication failed: ${authError.message}`);
    }

    if (!user) {
      throw new Error("No user found");
    }

    console.log(`🔎 Looking for user_id ${user.id}`);

    // First try to get the profile
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("stripe_customer_id, subscription_plan")
      .eq("user_id", user.id)
      .single();

    if (profileError) {
      console.log("Profile error:", profileError);
      throw profileError;
    }

    if (!profile) {
      throw new Error("No profile found");
    }

    console.log(`🔎 Found profile: ${profile}`);
    if (!profile?.stripe_customer_id) {
      throw new Error("No Stripe customer found");
    }

    const originUrl = req.headers.get("origin") ?? "http://localhost:3000";

    // Which plan does the user want? The body is optional: without it, the Premium plan.
    const body = await req.json().catch(() => ({}));
    const requestedPlan = body?.plan ?? "premium";
    if (!isPaidPlan(requestedPlan)) {
      throw new Error("Unknown plan");
    }

    // Create Portal session if already subscribed (premium or pro)
    if (isPaidPlan(profile.subscription_plan)) {
      const portalParams: Record<string, unknown> = {
        customer: profile.stripe_customer_id,
        return_url: `${originUrl}/profile`,
      };

      // The user asked for the OTHER paid plan (Premium -> Pro or Pro -> Premium):
      // open the portal straight on the screen that confirms the change.
      // If that is not possible, the normal portal opens and they can switch there.
      const newPriceId = PRICE_BY_PLAN[requestedPlan];
      if (body?.plan && requestedPlan !== profile.subscription_plan && newPriceId) {
        try {
          const { data: subscriptions } = await stripe.subscriptions.list({
            customer: profile.stripe_customer_id,
            status: "active",
            limit: 1,
          });
          const item = subscriptions[0]?.items.data[0];
          if (subscriptions[0] && item) {
            portalParams.flow_data = {
              type: "subscription_update_confirm",
              subscription_update_confirm: {
                subscription: subscriptions[0].id,
                items: [{ id: item.id, price: newPriceId, quantity: 1 }],
              },
            };
          }
        } catch (flowError) {
          console.log("Could not prepare the plan change screen:", flowError.message);
        }
      }

      const session = await stripe.billingPortal.sessions.create(portalParams);
      return new Response(JSON.stringify({ url: session.url }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create Checkout session for new subscribers, with the price of the chosen plan
    const priceId = PRICE_BY_PLAN[requestedPlan];
    if (!priceId) {
      throw new Error(`The ${requestedPlan} plan is not available yet`);
    }
    const session = await stripe.checkout.sessions.create({
      customer: profile.stripe_customer_id,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: "subscription",
      success_url: `${originUrl}/profile?success=true`,
      cancel_url: `${originUrl}/profile?canceled=true`,
    });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in create-stripe-session:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
