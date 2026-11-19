-- Test of the security rules (RLS) and delete rules of subtasks (Project 2, part 2).
--
-- It creates two fake users (A and B), acts as each of them, and checks what they can and
-- cannot do. Everything runs inside ONE transaction that is CANCELED on purpose: the last
-- line raises an error that carries the report, so nothing is left in the database.
-- The Stripe triggers are switched off inside the transaction so no Stripe customer is created.
--
-- Run it with:  npx supabase db query --linked -f docs/project2-subtasks-rls-test.sql
-- Read the result in the error message: every line starts with PASS or FAIL.

begin;

alter table public.profiles disable trigger create_stripe_customer_on_profile_creation;
alter table public.profiles disable trigger delete_stripe_customer_on_profile_deletion;

do $$
declare
  ua uuid := gen_random_uuid();
  ub uuid := gen_random_uuid();
  ta uuid; tb uuid; sa uuid; sb uuid;
  n int;
  r text := E'';
begin
  insert into auth.users (id, email) values (ua, 'a@test.invalid'), (ub, 'b@test.invalid');

  -- ===== user A: one task and one subtask
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.tasks (user_id, title) values (ua, 'Task A') returning task_id into ta;
  insert into public.subtasks (task_id, title, position) values (ta, 'Subtask A', 1) returning subtask_id into sa;
  select count(*) into n from public.subtasks where subtask_id = sa and is_done = false;
  r := r || case when n = 1 then 'PASS' else 'FAIL' end || E' S1 A creates a subtask in own task (is_done defaults to false)\n';

  -- ===== user B: one task and one subtask
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.tasks (user_id, title) values (ub, 'Task B') returning task_id into tb;
  insert into public.subtasks (task_id, title) values (tb, 'Subtask B') returning subtask_id into sb;
  select count(*) into n from public.subtasks;
  r := r || case when n = 1 then 'PASS' else 'FAIL' end || E' S2 B sees only own subtasks (sees ' || n || E')\n';

  begin
    insert into public.subtasks (task_id, title) values (ta, 'Fake in A task');
    r := r || E'FAIL S3 B created a subtask in A task\n';
  exception when others then
    r := r || case when sqlstate = '42501' then 'PASS' else 'FAIL' end || E' S3 B cannot create a subtask in A task (' || sqlstate || E')\n';
  end;

  update public.subtasks set title = 'hacked' where subtask_id = sa;
  get diagnostics n = row_count;
  r := r || case when n = 0 then 'PASS' else 'FAIL' end || E' S4 B cannot edit A subtask (rows changed: ' || n || E')\n';

  delete from public.subtasks where subtask_id = sa;
  get diagnostics n = row_count;
  r := r || case when n = 0 then 'PASS' else 'FAIL' end || E' S5 B cannot delete A subtask (rows deleted: ' || n || E')\n';

  begin
    update public.subtasks set task_id = ta where subtask_id = sb;
    r := r || E'FAIL S6 B moved own subtask into A task\n';
  exception when others then
    r := r || case when sqlstate = '42501' then 'PASS' else 'FAIL' end || E' S6 B cannot move own subtask into A task (' || sqlstate || E')\n';
  end;

  -- ===== back to A
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.subtasks;
  r := r || case when n = 1 then 'PASS' else 'FAIL' end || E' S7 A sees only own subtasks (sees ' || n || E')\n';

  update public.subtasks set is_done = true where subtask_id = sa;
  get diagnostics n = row_count;
  r := r || case when n = 1 then 'PASS' else 'FAIL' end || E' S8 A marks own subtask as done\n';

  delete from public.subtasks where subtask_id = sb;
  get diagnostics n = row_count;
  r := r || case when n = 0 then 'PASS' else 'FAIL' end || E' S9 A cannot delete B subtask (rows deleted: ' || n || E')\n';

  -- ===== a signed-out visitor sees nothing
  reset role;
  perform set_config('request.jwt.claims', '', true);
  set local role anon;
  select count(*) into n from public.subtasks;
  r := r || case when n = 0 then 'PASS' else 'FAIL' end || E' S10 anonymous visitor sees no subtasks (sees ' || n || E')\n';

  -- ===== delete rule: deleting a task deletes its subtasks
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  delete from public.tasks where task_id = ta;
  reset role;
  select count(*) into n from public.subtasks where subtask_id = sa;
  r := r || case when n = 0 then 'PASS' else 'FAIL' end || E' S11 deleting a task deletes its subtasks\n';
  select count(*) into n from public.subtasks where subtask_id = sb;
  r := r || case when n = 1 then 'PASS' else 'FAIL' end || E' S12 other subtasks are not touched\n';

  -- ===== whole-account delete works without errors
  begin
    delete from public.profiles where user_id = ub;
    select count(*) into n from public.subtasks where task_id = tb;
    r := r || case when n = 0 then 'PASS' else 'FAIL' end || E' S13 deleting a whole user also deletes their subtasks\n';
  exception when others then
    r := r || E'FAIL S13 deleting a user failed: ' || sqlerrm || E'\n';
  end;

  raise exception E'\nSUBTASKS RLS TEST REPORT\n%\n(the transaction is canceled on purpose)', r;
end $$;

rollback;
