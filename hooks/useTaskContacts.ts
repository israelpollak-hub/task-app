import { useState, useEffect } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { Contact, ContactRole, TaskPerson } from "@/types/models";

// The people linked to ONE task, plus the user's other contacts that could still be added.
// Row Level Security allows a link only if the task and the contact are both the user's.
export function useTaskContacts(taskId?: string) {
  const [people, setPeople] = useState<TaskPerson[]>([]);
  const [allContacts, setAllContacts] = useState<Contact[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );

  const fetchAll = async () => {
    if (!taskId) return;
    try {
      const [linksResponse, contactsResponse] = await Promise.all([
        supabase
          .from("task_contacts")
          .select("role, contact:contacts(*)")
          .eq("task_id", taskId),
        supabase.from("contacts").select("*").order("name", { ascending: true }),
      ]);

      if (linksResponse.error) throw linksResponse.error;
      if (contactsResponse.error) throw contactsResponse.error;

      const linked = ((linksResponse.data || []) as unknown as TaskPerson[]).sort(
        (a, b) => a.contact.name.localeCompare(b.contact.name)
      );
      setPeople(linked);
      setAllContacts(contactsResponse.data || []);
      setError(null);
    } catch (error: any) {
      console.error("Error fetching the people of the task:", error);
      setError(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, [taskId]);

  const addPerson = async (contactId: string, role: ContactRole) => {
    if (!taskId) throw new Error("No task found");
    const { error } = await supabase
      .from("task_contacts")
      .insert({ task_id: taskId, contact_id: contactId, role });
    if (error) throw error;
    await fetchAll();
  };

  const changeRole = async (contactId: string, role: ContactRole) => {
    if (!taskId) throw new Error("No task found");
    const { error } = await supabase
      .from("task_contacts")
      .update({ role })
      .eq("task_id", taskId)
      .eq("contact_id", contactId);
    if (error) throw error;
    await fetchAll();
  };

  const removePerson = async (contactId: string) => {
    if (!taskId) throw new Error("No task found");
    const { error } = await supabase
      .from("task_contacts")
      .delete()
      .eq("task_id", taskId)
      .eq("contact_id", contactId);
    if (error) throw error;
    await fetchAll();
  };

  // Contacts that are not in this task yet (the ones offered in the "add" drop-down).
  const linkedIds = new Set(people.map((p) => p.contact.contact_id));
  const availableContacts = allContacts.filter((c) => !linkedIds.has(c.contact_id));

  return {
    people,
    availableContacts,
    hasAnyContacts: allContacts.length > 0,
    isLoadingPeople: isLoading,
    peopleError: error,
    addPerson,
    changeRole,
    removePerson,
  };
}
