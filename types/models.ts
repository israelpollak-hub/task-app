import { Database } from "@/lib/database.types";

// Database Models
export type Task = Database["public"]["Tables"]["tasks"]["Row"];
export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type Contact = Database["public"]["Tables"]["contacts"]["Row"];
export type TaskContact = Database["public"]["Tables"]["task_contacts"]["Row"];

// The role a contact plays in a task (the database only accepts these three values).
export type ContactRole = "responsible" | "collaborator" | "stakeholder";

// A contact linked to a task, together with the role they have in that task.
export type TaskPerson = { role: ContactRole; contact: Contact };

// Extended User type that includes additional fields not in the database
export type User = Profile & {
  email: string;
  tasks_created: number;
};
