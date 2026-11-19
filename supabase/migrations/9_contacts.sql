-- Project 2: people related to each task.
--
-- contacts:      the people a user keeps (name, relationship, email).
-- task_contacts: bridge table. One row = "this contact takes part in this task, with this role".
--                A task can have many contacts and a contact can be in many tasks.

create table public.contacts (
  contact_id uuid primary key default gen_random_uuid(),
  -- auth.uid() is the logged-in user, so the app does not have to send user_id.
  user_id uuid not null default auth.uid() references public.profiles on delete cascade,
  name text not null,
  relationship text,
  email text,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

create table public.task_contacts (
  -- Deleting a task deletes its links.
  task_id uuid not null references public.tasks on delete cascade,
  -- No "on delete cascade" here on purpose: a contact that is still linked to a task
  -- cannot be deleted. (When a whole account is deleted, the tasks go first in the same
  -- statement, so their links disappear and the contacts can be deleted too.)
  contact_id uuid not null references public.contacts,
  role text not null check (role in ('responsible', 'collaborator', 'stakeholder')),
  -- One row per contact per task.
  primary key (task_id, contact_id)
);

-- Efficient lookups: a user's contacts by name, and "which tasks is this contact in?".
create index idx_contacts_user_name on public.contacts(user_id, name);
create index idx_task_contacts_contact on public.task_contacts(contact_id);

-- Enable RLS
alter table public.contacts enable row level security;
alter table public.task_contacts enable row level security;

-- Security policy: Users can CRUD their own contacts
create policy "Users can CRUD own contacts"
on public.contacts for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- Security policy: a link is visible/changeable only if BOTH the task and the contact
-- belong to the logged-in user. This also stops a user from linking their contact to
-- someone else's task (or the other way around).
create policy "Users can CRUD links between their own tasks and contacts"
on public.task_contacts for all
using (
  exists (
    select 1 from public.tasks t
    where t.task_id = task_contacts.task_id and t.user_id = auth.uid()
  )
  and exists (
    select 1 from public.contacts c
    where c.contact_id = task_contacts.contact_id and c.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.tasks t
    where t.task_id = task_contacts.task_id and t.user_id = auth.uid()
  )
  and exists (
    select 1 from public.contacts c
    where c.contact_id = task_contacts.contact_id and c.user_id = auth.uid()
  )
);
