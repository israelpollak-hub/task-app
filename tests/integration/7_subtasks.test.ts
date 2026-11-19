import { createClient, SupabaseClient } from "@supabase/supabase-js";
import {
  TestUser,
  getOrCreateTestUser,
  cleanupTestUser,
} from "../test-utils/user-testing-utils";
import { setUserSubscriptionTier } from "../test-utils/limit-testing-utils";

const TEST_USER_HEIDI = {
  name: "Heidi (Test User)",
  email: "test-user.heidi@pixegami.io",
  password: "Test123!@#Heidi",
};

const TEST_USER_IVAN = {
  name: "Ivan (Test User)",
  email: "test-user.ivan@pixegami.io",
  password: "Test123!@#Ivan",
};

const SUGGEST_SUBTASKS_ENDPOINT = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/suggest-subtasks`;

// Each user gets their own client, so both can be signed in at the same time.
async function signedInClient(user: TestUser): Promise<SupabaseClient> {
  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
  const { error } = await client.auth.signInWithPassword({
    email: user.email,
    password: user.password,
  });
  if (error) throw error;
  return client;
}

async function accessToken(client: SupabaseClient): Promise<string> {
  const {
    data: { session },
  } = await client.auth.getSession();
  if (!session) throw new Error("No session found");
  return session.access_token;
}

describe("Suite 7: Subtasks", () => {
  let heidi: TestUser;
  let ivan: TestUser;
  let heidiClient: SupabaseClient;
  let ivanClient: SupabaseClient;
  let heidiTaskId: string;

  beforeAll(async () => {
    heidi = await getOrCreateTestUser(TEST_USER_HEIDI);
    ivan = await getOrCreateTestUser(TEST_USER_IVAN);
    heidiClient = await signedInClient(heidi);
    ivanClient = await signedInClient(ivan);

    const { data, error } = await heidiClient
      .from("tasks")
      .insert({ user_id: heidi.id, title: "Plan a birthday party (subtasks test)" })
      .select()
      .single();
    if (error) throw error;
    heidiTaskId = data.task_id;
  });

  afterAll(async () => {
    // Deleting a user deletes their tasks and subtasks too.
    await cleanupTestUser(heidi?.id);
    await cleanupTestUser(ivan?.id);
  });

  test("can create and read subtasks of own task, in order", async () => {
    const { error } = await heidiClient.from("subtasks").insert([
      { task_id: heidiTaskId, title: "Book the venue", position: 2 },
      { task_id: heidiTaskId, title: "Make the guest list", position: 1 },
    ]);
    expect(error).toBeFalsy();

    const { data, error: readError } = await heidiClient
      .from("subtasks")
      .select()
      .eq("task_id", heidiTaskId)
      .order("position", { ascending: true });

    expect(readError).toBeFalsy();
    expect(data!.map((s) => s.title)).toEqual(["Make the guest list", "Book the venue"]);
    expect(data![0].is_done).toBe(false);
  });

  test("can mark a subtask as done", async () => {
    const { data: created } = await heidiClient
      .from("subtasks")
      .insert({ task_id: heidiTaskId, title: "Order the cake", position: 3 })
      .select()
      .single();

    const { data: updated, error } = await heidiClient
      .from("subtasks")
      .update({ is_done: true })
      .eq("subtask_id", created!.subtask_id)
      .select()
      .single();

    expect(error).toBeFalsy();
    expect(updated!.is_done).toBe(true);
  });

  test("a second user can NOT see, change, delete or add subtasks of the first user's task", async () => {
    // Cannot see them
    const { data: seen, error: seeError } = await ivanClient
      .from("subtasks")
      .select()
      .eq("task_id", heidiTaskId);
    expect(seeError).toBeFalsy();
    expect(seen).toHaveLength(0);

    const { data: all } = await ivanClient.from("subtasks").select();
    expect(all).toHaveLength(0);

    // Cannot change or delete them (no rows match for this user, so nothing happens)
    const { data: changed } = await ivanClient
      .from("subtasks")
      .update({ title: "hacked" })
      .eq("task_id", heidiTaskId)
      .select();
    expect(changed).toHaveLength(0);

    const { data: deleted } = await ivanClient
      .from("subtasks")
      .delete()
      .eq("task_id", heidiTaskId)
      .select();
    expect(deleted).toHaveLength(0);

    // Cannot add a subtask to her task
    const { error: insertError } = await ivanClient
      .from("subtasks")
      .insert({ task_id: heidiTaskId, title: "Intruder" });
    expect(insertError).toBeTruthy();

    // Heidi's subtasks are untouched
    const { data: still } = await heidiClient
      .from("subtasks")
      .select()
      .eq("task_id", heidiTaskId);
    expect(still!.length).toBeGreaterThanOrEqual(3);
    expect(still!.some((s) => s.title === "hacked" || s.title === "Intruder")).toBe(false);
  });

  test("deleting a task deletes its subtasks", async () => {
    const { data: task } = await heidiClient
      .from("tasks")
      .insert({ user_id: heidi.id, title: "Short-lived task (subtasks test)" })
      .select()
      .single();
    await heidiClient
      .from("subtasks")
      .insert({ task_id: task!.task_id, title: "Will disappear" });

    const { error } = await heidiClient.from("tasks").delete().eq("task_id", task!.task_id);
    expect(error).toBeFalsy();

    const { data: left } = await heidiClient
      .from("subtasks")
      .select()
      .eq("task_id", task!.task_id);
    expect(left).toHaveLength(0);
  });

  describe("suggest-subtasks (Edge Function)", () => {
    const askForSuggestions = async (client: SupabaseClient, taskId: string) =>
      fetch(SUGGEST_SUBTASKS_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${await accessToken(client)}`,
        },
        body: JSON.stringify({ task_id: taskId }),
      });

    test("AI suggestions are only for the Pro plan: free and premium users are refused", async () => {
      for (const plan of ["free", "premium"] as const) {
        await setUserSubscriptionTier(heidi.id, plan);
        const response = await askForSuggestions(heidiClient, heidiTaskId);
        expect(response.status).toBe(403);
        const result = await response.json();
        expect(result.code).toBe("upgrade_required");
        expect(result.suggestions).toBeUndefined();
      }
    });

    test("suggests 3 to 8 steps for own task and does NOT save them", async () => {
      await setUserSubscriptionTier(heidi.id, "pro");
      const { count: before } = await heidiClient
        .from("subtasks")
        .select("*", { count: "exact", head: true })
        .eq("task_id", heidiTaskId);

      const response = await fetch(SUGGEST_SUBTASKS_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${await accessToken(heidiClient)}`,
        },
        body: JSON.stringify({ task_id: heidiTaskId }),
      });

      expect(response.status).toBe(200);
      const result = await response.json();
      expect(Array.isArray(result.suggestions)).toBe(true);
      expect(result.suggestions.length).toBeGreaterThanOrEqual(3);
      expect(result.suggestions.length).toBeLessThanOrEqual(8);
      for (const s of result.suggestions) {
        expect(typeof s).toBe("string");
        expect(s.length).toBeGreaterThan(0);
        expect(s.length).toBeLessThanOrEqual(100);
      }

      // Nothing was saved by the function
      const { count: after } = await heidiClient
        .from("subtasks")
        .select("*", { count: "exact", head: true })
        .eq("task_id", heidiTaskId);
      expect(after).toBe(before);
    });

    test("refuses a task that belongs to another user", async () => {
      await setUserSubscriptionTier(ivan.id, "pro");
      const response = await fetch(SUGGEST_SUBTASKS_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${await accessToken(ivanClient)}`,
        },
        body: JSON.stringify({ task_id: heidiTaskId }),
      });

      expect(response.status).toBe(404);
      const result = await response.json();
      expect(result.suggestions).toBeUndefined();
    });

    test("refuses a request without a valid login or with a bad task_id", async () => {
      const noLogin = await fetch(SUGGEST_SUBTASKS_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task_id: heidiTaskId }),
      });
      expect([401, 403]).toContain(noLogin.status);

      const badId = await fetch(SUGGEST_SUBTASKS_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${await accessToken(heidiClient)}`,
        },
        body: JSON.stringify({ task_id: "not-a-uuid" }),
      });
      expect(badId.status).toBe(400);
    });
  });
});
