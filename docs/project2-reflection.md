# Project 2 reflection

In Project 2 I changed the task app's database and then added an OpenAI feature on top of it, working directly on `main` with the same Supabase project, GitHub repo and Vercel site.

**Part 1: contacts.** I added two tables, `contacts` and `task_contacts`. A person can be in many tasks and a task can have many people, so I needed a bridge table: `task_contacts` holds the task, the contact and a role. The most useful lesson was Row Level Security. Because the bridge table has no `user_id`, its policy checks that both the task and the contact belong to the logged-in user. I also chose what happens on delete: deleting a task removes its links, but a contact that is still in a task cannot be deleted, and the app explains why.

**Part 2: AI subtasks.** I added a `subtasks` table and a new Edge Function, `suggest-subtasks`. When I click the button, the function checks my login, reads the task through RLS (so another user's task looks like "not found" and OpenAI is never called), asks the same cheap model as the label feature for 3 to 8 steps in JSON, validates the reply and returns the suggestions without saving them. I then accept or reject each one, and only the accepted ones are saved.

**What I learned.** I was surprised that I did not need the OpenAI or Supabase websites: the OpenAI key was already a Supabase secret, and the Supabase command line could push the table and deploy the function. I tested the security with two simulated users inside a transaction that cancels itself, so nothing stayed in the real database. Running the whole test suite also showed an old bug that is not part of my work: deleting a task that has an image fails, because a trigger from the original code deletes from Supabase's storage tables, which Supabase now forbids.

**What I would do differently.** I would offer AI suggestions while creating a task, not only afterwards, and I would fix the image-deletion bug with a new migration.
