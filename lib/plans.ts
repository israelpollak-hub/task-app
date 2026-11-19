// The three price tiers, as shown in the app. The prices live in Stripe; the Edge Functions
// (supabase/functions/_shared/plans.ts) enforce the rules. This file is only for the screens.

export type PlanId = "free" | "premium" | "pro";

export type PlanInfo = {
  id: PlanId;
  name: string;
  price: string;
  features: string[];
};

export const PLANS: PlanInfo[] = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    features: ["100 tasks per month", "Subtasks and contacts", "AI labels for your tasks"],
  },
  {
    id: "premium",
    name: "Premium",
    price: "$10 / month",
    features: ["10,000 tasks per month", "Subtasks and contacts", "AI labels for your tasks"],
  },
  {
    id: "pro",
    name: "Pro",
    price: "$25 / month",
    features: [
      "50,000 tasks per month",
      "Subtasks and contacts",
      "AI labels for your tasks",
      "AI subtask suggestions",
    ],
  },
];

export function getPlanName(plan: string | null | undefined): string {
  return PLANS.find((p) => p.id === plan)?.name ?? "Free";
}

// Only the Pro plan can ask the AI for subtask suggestions.
// (The suggest-subtasks Edge Function checks the same rule on the server.)
export function canUseAiSubtasks(plan: string | null | undefined): boolean {
  return plan === "pro";
}
