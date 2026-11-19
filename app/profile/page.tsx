"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CreditCard, LogOut, Check, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LoadingSkeleton } from "@/components/LoadingSkeleton";
import { useSubscription } from "@/hooks/useSubscription";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/components/hooks/use-toast";
import { PLANS, PlanId, getPlanName } from "@/lib/plans";
import { cn } from "@/lib/utils";

export default function Profile() {
  const { user, isLoading, signOut } = useAuth();
  const { session } = useAuth();
  const { manageSubscription } = useSubscription();
  const { toast } = useToast();
  const [busyPlan, setBusyPlan] = useState<PlanId | "manage" | null>(null);

  if (isLoading || !user) {
    return <LoadingSkeleton />;
  }

  const currentPlan = (user.subscription_plan ?? "free") as PlanId;
  const isPaid = currentPlan === "premium" || currentPlan === "pro";

  // Opens Stripe: Checkout for a new subscription, or the customer portal to change or cancel.
  const goToStripe = async (busy: PlanId | "manage", plan?: "premium" | "pro") => {
    try {
      setBusyPlan(busy);
      await manageSubscription(session?.access_token ?? "", plan);
    } catch (error: any) {
      setBusyPlan(null);
      toast({
        title: "❌ Could not open Stripe",
        description: error?.message || "Please try again",
        variant: "destructive",
      });
    }
  };

  const buttonLabel = (planId: PlanId) => {
    if (planId === currentPlan) return "Current plan";
    if (planId === "free") return "Free plan";
    if (!isPaid) return `Choose ${getPlanName(planId)}`;
    return planId === "pro" ? "Upgrade to Pro" : "Switch to Premium";
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold mb-6">User Profile</h1>
      <Card>
        <CardHeader>
          <CardTitle>Personal Information</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          <p>Name: {user.name}</p>
          <p>Email: {user.email}</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Subscription</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div>
            <p>Current Plan: {currentPlan}</p>
            <p>
              Tasks Created: {user.tasks_created} / {user.tasks_limit}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {PLANS.map((plan) => {
              const isCurrent = plan.id === currentPlan;
              return (
                <div
                  key={plan.id}
                  className={cn(
                    "flex flex-col rounded-md border p-4",
                    isCurrent && "border-2 border-black"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-base font-semibold">{plan.name}</span>
                    {plan.id === "pro" && (
                      <Badge variant="secondary">
                        <Sparkles className="mr-1 h-3 w-3" />
                        AI
                      </Badge>
                    )}
                  </div>
                  <div className="mb-3 text-lg font-bold">{plan.price}</div>
                  <ul className="mb-4 flex-1 space-y-1">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-1">
                        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <Button
                    type="button"
                    variant={isCurrent || plan.id === "free" ? "outline" : "default"}
                    disabled={isCurrent || plan.id === "free" || busyPlan !== null}
                    onClick={() =>
                      plan.id !== "free" && goToStripe(plan.id, plan.id)
                    }
                  >
                    {busyPlan === plan.id ? "Opening Stripe..." : buttonLabel(plan.id)}
                  </Button>
                </div>
              );
            })}
          </div>

          {isPaid && (
            <Button
              type="button"
              variant="outline"
              disabled={busyPlan !== null}
              onClick={() => goToStripe("manage")}
            >
              <CreditCard className="mr-2 h-4 w-4" />
              {busyPlan === "manage" ? "Opening Stripe..." : "Manage Subscription"}
            </Button>
          )}
        </CardContent>
      </Card>
      <div className="flex justify-end">
        <Button variant="outline" onClick={signOut}>
          <LogOut className="mr-2 h-4 w-4" />
          Sign Out
        </Button>
      </div>
    </div>
  );
}
