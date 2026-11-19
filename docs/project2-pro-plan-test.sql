-- Test of the third price tier ("pro"): plan values, task limits, and that users cannot
-- give themselves a plan (migration 11).
--
-- Everything runs inside ONE transaction that is CANCELED on purpose: the last line raises
-- an error that carries the report, so nothing is left in the database.
-- The Stripe triggers are switched off inside the transaction so no Stripe customer is created.
--
-- Run it with:  npx supabase db query --linked -f docs/project2-pro-plan-test.sql
-- Read the result in the error message: every line starts with PASS or FAIL.

begin;

alter table public.profiles disable trigger create_stripe_customer_on_profile_creation;
alter table public.profiles disable trigger delete_stripe_customer_on_profile_deletion;

do $$
declare
  ua uuid := gen_random_uuid();
  ub uuid := gen_random_uuid();
  n int;
  v text;
  lim int;
  r text := E'';
begin
  insert into auth.users (id, email) values (ua, 'a@test.invalid'), (ub, 'b@test.invalid');

  select subscription_plan, tasks_limit into v, lim from public.profiles where user_id = ua;
  r := r || case when v = 'free' and lim = 100 then 'PASS' else 'FAIL' end || E' P1 a new user starts on free with 100 tasks (' || v || ', ' || lim || E')\n';

  -- plan changes made by the server (this is what the Stripe webhook does)
  update public.profiles set subscription_plan = 'pro' where user_id = ua;
  select subscription_plan, tasks_limit into v, lim from public.profiles where user_id = ua;
  r := r || case when v = 'pro' and lim = 50000 then 'PASS' else 'FAIL' end || E' P2 free -> pro gives 50000 tasks (' || lim || E')\n';

  update public.profiles set subscription_plan = 'premium' where user_id = ua;
  select tasks_limit into lim from public.profiles where user_id = ua;
  r := r || case when lim = 10000 then 'PASS' else 'FAIL' end || E' P3 pro -> premium gives 10000 tasks (' || lim || E')\n';

  update public.profiles set subscription_plan = 'pro' where user_id = ua;
  select tasks_limit into lim from public.profiles where user_id = ua;
  r := r || case when lim = 50000 then 'PASS' else 'FAIL' end || E' P4 premium -> pro gives 50000 tasks (' || lim || E')\n';

  update public.profiles set subscription_plan = 'free' where user_id = ua;
  select tasks_limit into lim from public.profiles where user_id = ua;
  r := r || case when lim = 100 then 'PASS' else 'FAIL' end || E' P5 pro -> free gives 100 tasks (' || lim || E')\n';

  begin
    update public.profiles set subscription_plan = 'gold' where user_id = ua;
    r := r || E'FAIL P6 an unknown plan was accepted\n';
  exception when others then
    r := r || case when sqlstate = '23514' then 'PASS' else 'FAIL' end || E' P6 an unknown plan is rejected (' || sqlstate || E')\n';
  end;

  -- a normal logged-in user: can read their own profile, cannot change the plan
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;

  select count(*) into n from public.profiles;
  r := r || case when n = 1 then 'PASS' else 'FAIL' end || E' P7 a user sees only their own profile (sees ' || n || E')\n';

  update public.profiles set subscription_plan = 'pro' where user_id = ua;
  get diagnostics n = row_count;
  r := r || case when n = 0 then 'PASS' else 'FAIL' end || E' P8 a user cannot give themselves pro (rows changed: ' || n || E')\n';

  update public.profiles set tasks_limit = 999999 where user_id = ua;
  get diagnostics n = row_count;
  r := r || case when n = 0 then 'PASS' else 'FAIL' end || E' P9 a user cannot raise their own task limit (rows changed: ' || n || E')\n';

  update public.profiles set subscription_plan = 'pro' where user_id = ub;
  get diagnostics n = row_count;
  r := r || case when n = 0 then 'PASS' else 'FAIL' end || E' P10 a user cannot change another user plan (rows changed: ' || n || E')\n';

  reset role;
  select subscription_plan into v from public.profiles where user_id = ua;
  r := r || case when v = 'free' then 'PASS' else 'FAIL' end || E' P11 the plan is still free after those attempts (' || v || E')\n';

  raise exception E'\nPRO PLAN TEST REPORT\n%\n(the transaction is canceled on purpose)', r;
end $$;

rollback;
