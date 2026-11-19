import { useState, useEffect } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { Subtask } from "@/types/models";

const SUGGEST_ENDPOINT = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/suggest-subtasks`;

// The same limit as the suggest-subtasks Edge Function.
export const MAX_SUBTASK_LENGTH = 100;

// The subtasks of ONE task, plus the AI suggestions that are waiting for the user's answer.
// Row Level Security lets the user read and change only the subtasks of their own tasks.
export function useSubtasks(taskId?: string) {
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );

  const fetchSubtasks = async () => {
    if (!taskId) return;
    try {
      const { data, error } = await supabase
        .from("subtasks")
        .select("*")
        .eq("task_id", taskId)
        .order("position", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      setSubtasks(data || []);
      setError(null);
    } catch (error: any) {
      console.error("Error fetching subtasks:", error);
      setError(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSubtasks();
  }, [taskId]);

  // New subtasks go to the end of the list.
  const nextPosition = () =>
    subtasks.reduce((max, s) => Math.max(max, s.position), 0) + 1;

  const addSubtask = async (title: string) => {
    if (!taskId) throw new Error("No task found");
    const clean = title.trim();
    if (!clean) throw new Error("Please write the subtask first");
    if (clean.length > MAX_SUBTASK_LENGTH) {
      throw new Error(`A subtask can have at most ${MAX_SUBTASK_LENGTH} characters`);
    }
    const { error } = await supabase
      .from("subtasks")
      .insert({ task_id: taskId, title: clean, position: nextPosition() });
    if (error) throw error;
    await fetchSubtasks();
  };

  const toggleDone = async (subtaskId: string, isDone: boolean) => {
    // Show the change right away; undo it if the database says no.
    const before = subtasks;
    setSubtasks(subtasks.map((s) => (s.subtask_id === subtaskId ? { ...s, is_done: isDone } : s)));
    const { error } = await supabase
      .from("subtasks")
      .update({ is_done: isDone })
      .eq("subtask_id", subtaskId);
    if (error) {
      setSubtasks(before);
      throw error;
    }
  };

  const deleteSubtask = async (subtaskId: string) => {
    const { error } = await supabase.from("subtasks").delete().eq("subtask_id", subtaskId);
    if (error) throw error;
    await fetchSubtasks();
  };

  // Ask the AI for suggestions. This runs ONLY when the user clicks the button.
  // The suggestions are not saved: the user accepts or rejects each one.
  const suggest = async () => {
    if (!taskId) throw new Error("No task found");
    setIsSuggesting(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("Please sign in again");

      const response = await fetch(SUGGEST_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ task_id: taskId }),
      });

      // The answer may not be JSON if something fails before the function runs.
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(result?.error || "Could not get suggestions. Please try again.");
      }
      if (!result || !Array.isArray(result.suggestions)) {
        throw new Error("Could not read the suggestions. Please try again.");
      }
      setSuggestions(result.suggestions as string[]);
    } finally {
      setIsSuggesting(false);
    }
  };

  // Accept one suggestion: save it as a real subtask and remove it from the waiting list.
  const acceptSuggestion = async (title: string) => {
    await addSubtask(title);
    setSuggestions((current) => current.filter((s) => s !== title));
  };

  // Reject one suggestion: it is only removed from the waiting list. Nothing is saved.
  const rejectSuggestion = (title: string) => {
    setSuggestions((current) => current.filter((s) => s !== title));
  };

  const clearSuggestions = () => setSuggestions([]);

  return {
    subtasks,
    suggestions,
    isLoadingSubtasks: isLoading,
    isSuggesting,
    subtasksError: error,
    addSubtask,
    toggleDone,
    deleteSubtask,
    suggest,
    acceptSuggestion,
    rejectSuggestion,
    clearSuggestions,
  };
}
