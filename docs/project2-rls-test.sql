-- Test of the security rules (RLS) and delete rules of contacts / task_contacts.
--
-- It creates two fake users (A and B), acts as each of them, and checks what they can and
-- cannot do. Everything runs inside ONE transaction that is CANCELED on purpose: the last
-- line raises an error that carries the report, so nothing is left in the database.
-- The Stripe triggers are switched off inside the transaction so no Stripe customer is created.
--
-- Run it with:  npx supabase db query --linked -f docs/project2-rls-test.sql
-- Read the result in the error message: every line starts with PASS or FAIL.

begin;

alter table public.profiles disable trigger create_stripe_customer_on_profile_creation;
alter table public.profiles disable trigger delete_stripe_customer_on_profile_deletion;

do $$
declare
  ua uuid := gen_random_uuid();
  ub uuid := gen_random_uuid();
  ta uuid; tb uuid; ca uuid; cb uuid;
  n int;
  r text := E'';
begin
  insert into auth.users (id, email) values (ua, 'a@test.invalid'), (ub, 'b@test.invalid');

  -- ===== act as user A: one task and one contact
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.tasks (user_id, title) values (ua, 'Task A') returning task_id into ta;
  insert into public.contacts (name) values ('Contact A') returning contact_id into ca;
  select count(*) into n from public.contacts where contact_id = ca and user_id = ua;
  r := r || case when n = 1 then 'PASS' else 'FAIL' end || E' T1 user_id is filled with the logged-in user\n';

  -- ===== act as user B: one task and one contact
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.tasks (user_id, title) values (ub, 'Task B') returning task_id into tb;
  insert into public.contacts (name) values ('Contact B') returning contact_id into cb;
  select count(*) into n from public.contacts;
  r := r || case when n = 1 then 'PASS' else 'FAIL' end || E' T2 B sees only own contacts (sees ' || n || E')\n';

  -- ===== back to A
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.contacts;
  r := r || case when n = 1 then 'PASS' else 'FAIL' end || E' T2b A sees only own contacts (sees ' || n || E')\n';

  begin
    insert into public.contacts (user_id, name) values (ub, 'Fake for B');
    r := r || E'FAIL T3 A created a contact for B\n';
  exception when others then
    r := r || case when sqlstate = '42501' then 'PASS' else 'FAIL' end || E' T3 A cannot create a contact for B (' || sqlstate || E')\n';
  end;

  begin
    insert into public.task_contacts (task_id, contact_id, role) values (ta, ca, 'responsible');
    r := r || E'PASS T4 A links own task with own contact\n';
  exception when others then
    r := r || E'FAIL T4 A could not link own task and contact: ' || sqlerrm || E'\n';
  end;

  begin
    insert into public.task_contacts (task_id, contact_id, role) values (ta, cb, 'responsible');
    r := r || E'FAIL T5 A linked own task with B contact\n';
  exception when others then
    r := r || case when sqlstate = '42501' then 'PASS' else 'FAIL' end || E' T5 A cannot link own task with B contact (' || sqlstate || E')\n';
  end;

  begin
    insert into public.task_contacts (task_id, contact_id, role) values (tb, ca, 'responsible');
    r := r || E'FAIL T6 A linked B task with own contact\n';
  exception when others then
    r := r || case when sqlstate = '42501' then 'PASS' else 'FAIL' end || E' T6 A cannot link B task with own contact (' || sqlstate || E')\n';
  end;

  begin
    insert into public.task_contacts (task_id, contact_id, role) values (ta, ca, 'collaborator');
    r := r || E'FAIL T8 duplicate link was accepted\n';
  exception when others then
    r := r || case when sqlstate = '23505' then 'PASS' else 'FAIL' end || E' T8 same contact twice in one task is rejected (' || sqlstate || E')\n';
  end;

  begin
    insert into public.task_contacts (task_id, contact_id, role) values (ta, ca, 'boss');
    r := r || E'FAIL T9 invalid role was accepted\n';
  exception when others then
    r := r || case when sqlstate = '23514' then 'PASS' else 'FAIL' end || E' T9 role outside the list is rejected (' || sqlstate || E')\n';
  end;

  begin
    delete from public.contacts where contact_id = ca;
    r := r || E'FAIL T10 a linked contact was deleted\n';
  exception when others then
    r := r || case when sqlstate = '23503' then 'PASS' else 'FAIL' end || E' T10 deleting a linked contact is blocked (' || sqlstate || E')\n';
  end;

  -- ===== B tries to touch A's data
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.task_contacts;
  r := r || case when n = 0 then 'PASS' else 'FAIL' end || E' T7 B sees no links of A (sees ' || n || E')\n';
  delete from public.task_contacts where task_id = ta;
  get diagnostics n = row_count;
  r := r || case when n = 0 then 'PASS' else 'FAIL' end || E' T11 B cannot delete A links (deleted ' || n || E')\n';
  update public.contacts set name = 'hacked' where contact_id = ca;
  get diagnostics n = row_count;
  r := r || case when n = 0 then 'PASS' else 'FAIL' end || E' T11b B cannot edit A contacts (changed ' || n || E')\n';

  -- ===== back to A: delete the task, the link goes away, the contact stays
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  delete from public.tasks where task_id = ta;
  reset role;
  select count(*) into n from public.task_contacts where task_id = ta;
  r := r || case when n = 0 then 'PASS' else 'FAIL' end || E' T12 deleting a task deletes its links\n';
  select count(*) into n from public.contacts where contact_id = ca;
  r := r || case when n = 1 then 'PASS' else 'FAIL' end || E' T12b the contact is still there\n';

  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  delete from public.contacts where contact_id = ca;
  get diagnostics n = row_count;
  r := r || case when n = 1 then 'PASS' else 'FAIL' end || E' T13 an unlinked contact can be deleted\n';

  -- ===== deleting whole accounts must work, even with links still in place
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.task_contacts (task_id, contact_id, role) values (tb, cb, 'stakeholder');
  reset role;
  begin
    delete from auth.users where id in (ua, ub);
    select count(*) into n from public.tasks where user_id in (ua, ub);
    r := r || case when n = 0 then 'PASS' else 'FAIL' end || E' T14 deleting accounts removes their tasks\n';
    select count(*) into n from public.contacts where user_id in (ua, ub);
    r := r || case when n = 0 then 'PASS' else 'FAIL' end || E' T14b ...and their contacts\n';
    select count(*) into n from public.task_contacts where task_id = tb or contact_id = cb;
    r := r || case when n = 0 then 'PASS' else 'FAIL' end || E' T14c ...and their links\n';
  exception when others then
    r := r || E'FAIL T14 deleting accounts failed: ' || sqlerrm || E'\n';
  end;

  -- The error below cancels the whole transaction. Nothing is saved.
  raise exception E'RLS TEST REPORT (nothing was saved)\n%', r;
end $$;

rollback;
