-- Third price tier: "pro".
--   free     100 tasks per month
--   premium  10,000 tasks per month
--   pro      50,000 tasks per month, and AI subtask suggestions
-- The plan is set only by the Stripe webhook (Edge Function, with the secret key).
-- Users can only READ their profile (there is no update policy), so nobody can give
-- themselves a plan.

-- 1. The plan column may now hold 'pro'.
alter table public.profiles
  drop constraint if exists profiles_subscription_plan_check;

alter table public.profiles
  add constraint profiles_subscription_plan_check
  check (subscription_plan in ('free', 'premium', 'pro'));

-- 2. The task limit follows the plan, for every change between plans
--    (free <-> premium <-> pro). Migration 6 only handled free <-> premium.
create or replace function update_task_limit_on_plan_change()
returns trigger
security definer
set search_path = public
as $$
begin
  if new.subscription_plan is distinct from old.subscription_plan then
    new.tasks_limit := case new.subscription_plan
      when 'pro' then 50000
      when 'premium' then 10000
      else 100
    end;
  end if;
  return new;
end;
$$ language plpgsql;
