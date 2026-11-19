export interface SubscriptionOperations {
  // `plan` is the paid plan the user wants ("premium" or "pro"). Without it, Premium.
  manageSubscription: (
    accessToken: string,
    plan?: "premium" | "pro"
  ) => Promise<void>;
}

export type UseSubscriptionReturn = SubscriptionOperations;
