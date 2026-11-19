import { useState, useEffect } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { Contact } from "@/types/models";
import { isValidEmail } from "@/lib/contacts";

export interface ContactInput {
  name: string;
  relationship: string;
  email: string;
}

// Reads and changes the logged-in user's contacts.
// Row Level Security in the database makes sure a user only ever sees their own contacts.
export function useContacts() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );

  const fetchContacts = async () => {
    try {
      const { data, error } = await supabase
        .from("contacts")
        .select("*")
        .order("name", { ascending: true });

      if (error) throw error;
      setContacts(data || []);
      setError(null);
    } catch (error: any) {
      console.error("Error fetching contacts:", error);
      setError(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchContacts();
  }, []);

  // Empty optional fields are saved as null, not as an empty string.
  const cleanInput = (input: ContactInput) => {
    const name = input.name.trim();
    const relationship = input.relationship.trim();
    const email = input.email.trim();
    if (!name) throw new Error("Name is required");
    if (!isValidEmail(email)) throw new Error("That email does not look right");
    return {
      name,
      relationship: relationship || null,
      email: email || null,
    };
  };

  // user_id is not sent: the database fills it with the logged-in user.
  const createContact = async (input: ContactInput) => {
    const { error } = await supabase.from("contacts").insert(cleanInput(input));
    if (error) throw error;
    await fetchContacts();
  };

  const updateContact = async (contactId: string, input: ContactInput) => {
    const { error } = await supabase
      .from("contacts")
      .update(cleanInput(input))
      .eq("contact_id", contactId);
    if (error) throw error;
    await fetchContacts();
  };

  // A contact that is still linked to a task cannot be deleted (the database blocks it),
  // so we count the links first to give a clear message.
  const deleteContact = async (contactId: string) => {
    const { count, error: countError } = await supabase
      .from("task_contacts")
      .select("task_id", { count: "exact", head: true })
      .eq("contact_id", contactId);
    if (countError) throw countError;
    if (count && count > 0) {
      throw new Error(
        `This contact is in ${count} task${count === 1 ? "" : "s"}. Remove it from ${
          count === 1 ? "that task" : "those tasks"
        } first.`
      );
    }

    const { error } = await supabase
      .from("contacts")
      .delete()
      .eq("contact_id", contactId);
    if (error) {
      // 23503 = the database refused because a link still exists (safety net).
      if (error.code === "23503") {
        throw new Error("This contact is still in a task. Remove it from the task first.");
      }
      throw error;
    }
    await fetchContacts();
  };

  return {
    contacts,
    isLoading,
    error,
    createContact,
    updateContact,
    deleteContact,
    refreshContacts: fetchContacts,
  };
}
