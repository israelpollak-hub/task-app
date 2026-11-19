-- Project 2, part 2: subtasks (small steps that belong to one task).
-- One task has many subtasks. Deleting a task deletes its subtasks.

create table public.subtasks (
  subtask_id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks on delete cascade,
  title text not null,
  is_done boolean not null default false,
  position integer not null default 0,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- Fast reads of one task's subtasks, in order.
create index idx_subtasks_task_position on public.subtasks(task_id, position);

alter table public.subtasks enable row level security;

-- subtasks has no user_id, so ownership comes from the task:
-- a user can see and change a subtask only if the task it belongs to is theirs.
-- "with check" also applies to the new task_id, so a subtask cannot be created in
-- (or moved to) somebody else's task.
create policy "Users can CRUD subtasks of their own tasks"
on public.subtasks for all
using (
  exists (
    select 1 from public.tasks t
    where t.task_id = subtasks.task_id and t.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.tasks t
    where t.task_id = subtasks.task_id and t.user_id = auth.uid()
  )
);
