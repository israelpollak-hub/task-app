// The rules for AI-suggested subtasks, used by the suggest-subtasks Edge Function.
//
// The AI is asked for a JSON object like {"subtasks": ["Step one", "Step two"]}. This
// file checks the AI's reply before it is sent to the app: it must be valid JSON, each
// step must be short, clean text, and steps that repeat each other (or a subtask the
// task already has) are dropped. It is plain TypeScript (no Deno or Node features), so
// the Jest tests in tests/unit can test it too.

// How many steps we ask the AI for.
export const MIN_SUGGESTIONS = 3;
export const MAX_SUGGESTIONS = 8;

// The longest subtask title allowed.
export const MAX_SUBTASK_LENGTH = 100;

// Thrown when the AI's reply cannot be used. The message is safe to show to the user.
export class SuggestionsError extends Error {}

// Tidy up one step: single spaces, and no list marker ("1.", "-", "•") or quotes at the
// ends (the AI sometimes adds them).
export function normalizeSubtaskTitle(raw: unknown): string {
  if (typeof raw !== "string") return "";
  let title = raw.trim().replace(/\s+/g, " ");
  title = title.replace(/^(?:[-*•]|\d+[.)])\s+/, "");
  title = title.replace(/^["'`]+|["'`]+$/g, "");
  return title.trim();
}

// The AI sometimes wraps its JSON in a ```json ... ``` block. Remove the fence.
function stripCodeFence(text: string): string {
  const match = text.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match ? match[1] : text.trim();
}

// Turn the AI's reply into a clean list of at most MAX_SUGGESTIONS subtask titles.
// `existingTitles` are the subtasks the task already has: they are not suggested again.
// Throws SuggestionsError if the reply is not valid JSON or has no usable step.
export function parseSubtaskSuggestions(
  reply: string | null | undefined,
  existingTitles: string[] = []
): string[] {
  if (!reply || reply.trim() === "") {
    throw new SuggestionsError("The AI did not answer. Please try again.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripCodeFence(reply));
  } catch {
    throw new SuggestionsError(
      "The AI answered in a format we could not read. Please try again."
    );
  }

  // Accept {"subtasks": [...]} (what we ask for) or a bare list [...].
  const list = Array.isArray(parsed)
    ? parsed
    : (parsed as { subtasks?: unknown } | null)?.subtasks;
  if (!Array.isArray(list)) {
    throw new SuggestionsError(
      "The AI answered in a format we could not read. Please try again."
    );
  }

  const seen = new Set(existingTitles.map((t) => normalizeSubtaskTitle(t).toLowerCase()));
  const result: string[] = [];
  for (const item of list) {
    const title = normalizeSubtaskTitle(item);
    if (title === "" || title.length > MAX_SUBTASK_LENGTH) continue;
    const key = title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(title);
    if (result.length === MAX_SUGGESTIONS) break;
  }

  if (result.length === 0) {
    throw new SuggestionsError(
      "The AI did not give any usable suggestion. Please try again."
    );
  }
  return result;
}
