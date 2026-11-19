import { supabase, supabaseServiceClient } from "../test-utils/supabase-client";
import { describe, expect, test } from "@jest/globals";
import Stripe from "stripe";
import {
  TestUser,
  getOrCreateTestUser,
  cleanupTestUser,
} from "../test-utils/user-testing-utils";
import {
  setUserSubscriptionTier,
  TASK_LIMITS,
} from "../test-utils/limit-testing-utils";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const WEBHOOK_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/stripe-webhook`;
const TEST_USER_GREG = {
  name: "Greg (Test User)",
  email: "test-user.greg@pixegami.io",
  password: "Test123!@#Greg",
};

describe("Suite 6: Stripe Payments Integration", () => {
  let customerId: string;
  let testUser: TestUser | null;
  let paymentMethodId: string;

  const createPaymentMethod = async () => {
    const paymentMethod = await stripe.paymentMethods.create({
      type: "card",
      card: { token: "tok_visa" },
    });
    paymentMethodId = paymentMethod.id;

    // Attach payment method to customer
    await stripe.paymentMethods.attach(paymentMethodId, {
      customer: customerId,
    });

    // Set as default payment method
    await stripe.customers.update(customerId, {
      invoice_settings: {
        default_payment_method: paymentMethodId,
      },
    });
    console.log(
      `💳 Created Payment Method ${paymentMethodId} for Customer: ${customerId}`
    );
  };

  const sendWebhookEvent = async (event: any) => {
    const response = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Stripe-Signature": stripe.webhooks.generateTestHeaderString({
          payload: JSON.stringify(event),
          secret: process.env.STRIPE_WEBHOOK_SECRET!,
        }),
      },
      body: JSON.stringify(event),
    });
    console.log(`👉 Webhook Response: ${response.status}`);
    return response;
  };

  const createSubscription = async (
    priceId: string | undefined = process.env.STRIPE_PRICE_ID
  ) => {
    if (!paymentMethodId) {
      throw new Error("Payment method ID not set");
    }
    console.log(`👉 Creating Subscription with Payment ID: ${paymentMethodId}`);
    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: priceId }],
      trial_period_days: 0,
      default_payment_method: paymentMethodId,
    });
    return subscription;
  };

  beforeAll(async () => {
    testUser = await getOrCreateTestUser(TEST_USER_GREG);

    // Get the corresponding Stripe customer ID.
    const { data: profile } = await supabaseServiceClient
      .from("profiles")
      .select("stripe_customer_id")
      .eq("user_id", testUser?.id)
      .single();

    if (!profile) {
      throw new Error("No profile found");
    }

    customerId = profile.stripe_customer_id;
    console.log(`🔒 Created User with Stripe Customer ID: ${customerId}`);
    await createPaymentMethod();
  }, 15_000);

  afterAll(async () => {
    if (testUser) {
      await cleanupTestUser(testUser.id);
    }
  });

  test("subscription updates user to premium", async () => {
    // Set user to "free" tier
    await setUserSubscriptionTier(testUser!.id, "free");

    // Create and complete subscription
    const subscription = await createSubscription();

    // Simulate checkout.session.completed webhook
    const event = {
      type: "checkout.session.completed",
      data: {
        object: {
          subscription: subscription.id,
          customer: customerId,
        },
      },
    };
    console.log(`👉 Webhook Event Created: ${event.type}`);

    const response = await sendWebhookEvent(event);
    expect(response.status).toBe(200);

    // Verify database update
    const { data: profile } = await supabase
      .from("profiles")
      .select()
      .eq("stripe_customer_id", customerId)
      .single();

    expect(profile.subscription_plan).toBe("premium");
  }, 30_000);

  test("deleted subscription updates user to free", async () => {
    // Create a subscription
    await setUserSubscriptionTier(testUser!.id, "premium");
    const subscription = await createSubscription();
    console.log(`✅ Created Subscription: ${subscription.id}`);

    // Delete the subscription
    await stripe.subscriptions.cancel(subscription.id);
    console.log(`✅ Cancel Subscription: ${subscription.id}`);

    // Simulate customer.subscription.deleted webhook
    const event = {
      type: "customer.subscription.deleted",
      data: {
        object: {
          id: subscription.id,
          customer: customerId,
        },
      },
    };
    console.log(`👉 Webhook Event Created: ${event.type}`);
    const response = await sendWebhookEvent(event);
    expect(response.status).toBe(200);

    // Verify database update
    const { data: profile } = await supabase
      .from("profiles")
      .select()
      .eq("stripe_customer_id", customerId)
      .single();

    expect(profile.subscription_plan).toBe("free");
    expect(profile.tasks_limit).toBe(TASK_LIMITS.FREE_TIER);
  }, 30_000);

  const readProfile = async () => {
    const { data: profile } = await supabase
      .from("profiles")
      .select()
      .eq("stripe_customer_id", customerId)
      .single();
    return profile;
  };

  test("subscription to the Pro price updates user to pro", async () => {
    await setUserSubscriptionTier(testUser!.id, "free");
    const subscription = await createSubscription(process.env.STRIPE_PRO_PRICE_ID);

    const response = await sendWebhookEvent({
      type: "checkout.session.completed",
      data: { object: { subscription: subscription.id, customer: customerId } },
    });
    expect(response.status).toBe(200);

    const profile = await readProfile();
    expect(profile.subscription_plan).toBe("pro");
    expect(profile.tasks_limit).toBe(TASK_LIMITS.PRO_TIER);

    await stripe.subscriptions.cancel(subscription.id);
  }, 30_000);

  test("switching a subscription between Premium and Pro changes the plan", async () => {
    await setUserSubscriptionTier(testUser!.id, "free");
    const subscription = await createSubscription();
    await sendWebhookEvent({
      type: "customer.subscription.created",
      data: { object: { id: subscription.id, customer: customerId } },
    });
    expect((await readProfile()).subscription_plan).toBe("premium");

    // Upgrade to Pro (what the customer portal does)
    await stripe.subscriptions.update(subscription.id, {
      items: [{ id: subscription.items.data[0].id, price: process.env.STRIPE_PRO_PRICE_ID }],
    });
    const upgradeResponse = await sendWebhookEvent({
      type: "customer.subscription.updated",
      data: { object: { id: subscription.id, customer: customerId } },
    });
    expect(upgradeResponse.status).toBe(200);
    let profile = await readProfile();
    expect(profile.subscription_plan).toBe("pro");
    expect(profile.tasks_limit).toBe(TASK_LIMITS.PRO_TIER);

    // Downgrade back to Premium
    await stripe.subscriptions.update(subscription.id, {
      items: [{ id: subscription.items.data[0].id, price: process.env.STRIPE_PRICE_ID }],
    });
    await sendWebhookEvent({
      type: "customer.subscription.updated",
      data: { object: { id: subscription.id, customer: customerId } },
    });
    profile = await readProfile();
    expect(profile.subscription_plan).toBe("premium");
    expect(profile.tasks_limit).toBe(TASK_LIMITS.PREMIUM_TIER);

    await stripe.subscriptions.cancel(subscription.id);
  }, 40_000);

  test("a Pro subscription that is cancelled goes back to free", async () => {
    await setUserSubscriptionTier(testUser!.id, "free");
    const subscription = await createSubscription(process.env.STRIPE_PRO_PRICE_ID);
    await sendWebhookEvent({
      type: "customer.subscription.created",
      data: { object: { id: subscription.id, customer: customerId } },
    });
    expect((await readProfile()).subscription_plan).toBe("pro");

    await stripe.subscriptions.cancel(subscription.id);
    const response = await sendWebhookEvent({
      type: "customer.subscription.deleted",
      data: { object: { id: subscription.id, customer: customerId } },
    });
    expect(response.status).toBe(200);

    const profile = await readProfile();
    expect(profile.subscription_plan).toBe("free");
    expect(profile.tasks_limit).toBe(TASK_LIMITS.FREE_TIER);
  }, 40_000);

  test("the webhook rejects an event with a wrong signature", async () => {
    const response = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Stripe-Signature": "t=1,v1=bad" },
      body: JSON.stringify({ type: "customer.subscription.deleted" }),
    });
    expect(response.status).toBe(400);
  });
});
