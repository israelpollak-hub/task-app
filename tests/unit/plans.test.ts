import {
  canUseAiSubtasks,
  isPaidPlan,
  planForPriceId,
  planForSubscription,
} from "../../supabase/functions/_shared/plans";

const prices = { premium: "price_premium", pro: "price_pro" };
const sub = (status: string, priceId: string) => ({
  status,
  items: { data: [{ price: { id: priceId } }] },
});

describe("canUseAiSubtasks", () => {
  it("is true only for the pro plan", () => {
    expect(canUseAiSubtasks("pro")).toBe(true);
    expect(canUseAiSubtasks("premium")).toBe(false);
    expect(canUseAiSubtasks("free")).toBe(false);
    expect(canUseAiSubtasks(null)).toBe(false);
    expect(canUseAiSubtasks(undefined)).toBe(false);
    expect(canUseAiSubtasks("PRO")).toBe(false);
  });
});

describe("isPaidPlan", () => {
  it("accepts premium and pro only", () => {
    expect(isPaidPlan("premium")).toBe(true);
    expect(isPaidPlan("pro")).toBe(true);
    expect(isPaidPlan("free")).toBe(false);
    expect(isPaidPlan("gold")).toBe(false);
    expect(isPaidPlan(undefined)).toBe(false);
  });
});

describe("planForPriceId", () => {
  it("maps each Stripe price to its plan", () => {
    expect(planForPriceId("price_premium", prices)).toBe("premium");
    expect(planForPriceId("price_pro", prices)).toBe("pro");
  });

  it("returns null for an unknown price, or when the price ids are not set", () => {
    expect(planForPriceId("price_other", prices)).toBeNull();
    expect(planForPriceId(undefined, prices)).toBeNull();
    expect(planForPriceId("price_pro", {})).toBeNull();
    expect(planForPriceId("price_pro", { premium: "price_pro", pro: null })).toBe("premium");
  });
});

describe("planForSubscription", () => {
  it("gives the plan of the price while the subscription is paid", () => {
    expect(planForSubscription(sub("active", "price_pro"), prices)).toBe("pro");
    expect(planForSubscription(sub("active", "price_premium"), prices)).toBe("premium");
    expect(planForSubscription(sub("trialing", "price_pro"), prices)).toBe("pro");
    expect(planForSubscription(sub("past_due", "price_premium"), prices)).toBe("premium");
  });

  it("gives free when the subscription is over", () => {
    for (const status of ["canceled", "unpaid", "incomplete_expired", "paused"]) {
      expect(planForSubscription(sub(status, "price_pro"), prices)).toBe("free");
    }
  });

  it("changes nothing when the status is unclear or the price is unknown", () => {
    expect(planForSubscription(sub("incomplete", "price_pro"), prices)).toBeNull();
    expect(planForSubscription(sub("active", "price_unknown"), prices)).toBeNull();
    expect(planForSubscription({ status: "active", items: { data: [] } }, prices)).toBeNull();
  });
});
