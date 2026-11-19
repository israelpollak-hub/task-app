import {
  MAX_SUBTASK_LENGTH,
  MAX_SUGGESTIONS,
  normalizeSubtaskTitle,
  parseSubtaskSuggestions,
  SuggestionsError,
} from "../../supabase/functions/_shared/subtaskRules";

describe("normalizeSubtaskTitle", () => {
  it("removes list markers, quotes and extra spaces", () => {
    expect(normalizeSubtaskTitle("  1.   Buy   milk ")).toBe("Buy milk");
    expect(normalizeSubtaskTitle("- Call the dentist")).toBe("Call the dentist");
    expect(normalizeSubtaskTitle('"Pack the bag"')).toBe("Pack the bag");
  });

  it("returns an empty string for things that are not text", () => {
    expect(normalizeSubtaskTitle(42)).toBe("");
    expect(normalizeSubtaskTitle(null)).toBe("");
  });
});

describe("parseSubtaskSuggestions", () => {
  it("reads the {subtasks: [...]} shape we ask for", () => {
    const reply = JSON.stringify({ subtasks: ["Make a list", "Go to the store", "Pay"] });
    expect(parseSubtaskSuggestions(reply)).toEqual(["Make a list", "Go to the store", "Pay"]);
  });

  it("also accepts a bare list and a reply wrapped in a code fence", () => {
    expect(parseSubtaskSuggestions('["A", "B"]')).toEqual(["A", "B"]);
    expect(parseSubtaskSuggestions('```json\n{"subtasks": ["A", "B"]}\n```')).toEqual(["A", "B"]);
  });

  it("throws a friendly SuggestionsError when the reply is not valid JSON", () => {
    expect(() => parseSubtaskSuggestions("Sure! Here are some steps: 1. A 2. B")).toThrow(
      SuggestionsError
    );
    expect(() => parseSubtaskSuggestions('{"subtasks": ["A", ')).toThrow(SuggestionsError);
  });

  it("throws when the JSON has the wrong shape or no usable step", () => {
    expect(() => parseSubtaskSuggestions('{"steps": ["A"]}')).toThrow(SuggestionsError);
    expect(() => parseSubtaskSuggestions('{"subtasks": []}')).toThrow(SuggestionsError);
    expect(() => parseSubtaskSuggestions('{"subtasks": [1, null, ""]}')).toThrow(SuggestionsError);
    expect(() => parseSubtaskSuggestions("")).toThrow(SuggestionsError);
    expect(() => parseSubtaskSuggestions(null)).toThrow(SuggestionsError);
  });

  it("drops steps that repeat each other or a subtask the task already has", () => {
    const reply = JSON.stringify({ subtasks: ["Buy milk", "buy  MILK", "Buy bread", "Call mom"] });
    expect(parseSubtaskSuggestions(reply, ["Buy bread"])).toEqual(["Buy milk", "Call mom"]);
  });

  it("drops steps that are too long and keeps at most MAX_SUGGESTIONS", () => {
    const tooLong = "x".repeat(MAX_SUBTASK_LENGTH + 1);
    const many = Array.from({ length: 12 }, (_, i) => `Step ${i + 1}`);
    const result = parseSubtaskSuggestions(JSON.stringify({ subtasks: [tooLong, ...many] }));
    expect(result).toHaveLength(MAX_SUGGESTIONS);
    expect(result[0]).toBe("Step 1");
  });
});
