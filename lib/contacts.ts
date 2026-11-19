import { ContactRole } from "@/types/models";

// The roles a contact can have in a task. The values must match the check constraint in
// supabase/migrations/9_contacts.sql.
export const CONTACT_ROLES: { value: ContactRole; label: string }[] = [
  { value: "responsible", label: "Responsible" },
  { value: "collaborator", label: "Collaborator" },
  { value: "stakeholder", label: "Stakeholder" },
];

export function getRoleLabel(role: string): string {
  return CONTACT_ROLES.find((r) => r.value === role)?.label ?? role;
}

// Light check for the optional email field: empty is fine, otherwise it needs an "@" and a dot.
export function isValidEmail(email: string): boolean {
  return email === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
