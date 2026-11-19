// The rules for the three price tiers, used by the Edge Functions (stripe-webhook,
// create-stripe-session, suggest-subtasks). It is plain TypeScript (no Deno or Node
// features), so the Jest tests in tests/unit can test it too.
//
//   free     100 tasks per month
//   premium  10,000 tasks per month
//   pro      50,000 tasks per month, and AI subtask suggestions

export type Plan = "free" | "premium" | "pro";

export const PAID_PLANS: Plan[] = ["premium", "pro"];

export function isPaidPlan(value: unknown): value is "premium" | "pro" {
  return value === "premium" || value === "pro";
}

// Only the Pro plan can ask the AI for subtask suggestions.
export function canUseAiSubtasks(plan: string | null | undefined): boolean {
  return plan === "pro";
}

// The Stripe price ids of the paid plans (kept as secrets in Supabase).
export type PlanPrices = { premium?: string | null; pro?: string | null };

// Which plan does a Stripe price belong to? null = a price we do not know.
export function planForPriceId(
  priceId: string | null | undefined,
  prices: PlanPrices
): "premium" | "pro" | null {
  if (!priceId) return null;
  if (prices.pro && priceId === prices.pro) return "pro";
  if (prices.premium && priceId === prices.premium) return "premium";
  return null;
}

// The part of a Stripe subscription that decides the plan.
export type SubscriptionLike = {
  status: string;
  items: { data: { price: { id: string } }[] };
};

// What plan should the user have, given the subscription Stripe reports?
//   a paid subscription      -> the plan of its price
//   a finished subscription  -> "free"
//   anything unclear         -> null (leave the user's plan as it is)
export function planForSubscription(
  subscription: SubscriptionLike,
  prices: PlanPrices
): Plan | null {
  switch (subscription.status) {
    case "active":
    case "trialing":
    case "past_due": {
      // The user keeps the plan while Stripe retries a failed payment (past_due).
      const priceId = subscription.items.data[0]?.price.id;
      return planForPriceId(priceId, prices);
    }
    case "canceled":
    case "unpaid":
    case "incomplete_expired":
    case "paused":
      return "free";
    default:
      // "incomplete": the first payment has not gone through yet.
      return null;
  }
}
