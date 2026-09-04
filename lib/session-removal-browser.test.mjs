import assert from "node:assert/strict";
import test from "node:test";
import {
  fetchRemovedSessions,
  parseRemovedSessionsPage,
  renameSession,
  removeSession,
  restoreRemovedSession,
  purgeRemovedSession,
  updateRemovedSessionRetention,
} from "./session-removal-browser.ts";

function removedSession() {
  return {
    id: "session-1",
    projectId: "chat",
    cwd: "/workspace",
    created: "2026-09-01T00:00:00.000Z",
    modified: "2026-09-01T01:00:00.000Z",
    messageCount: 2,
    firstMessage: "hello",
    removedAt: "2026-09-02T00:00:00.000Z",
    purgeAt: "2026-10-02T00:00:00.000Z",
  };
}

test("Session removal browser contract validates list and mutation responses", async (t) => {
  assert.equal(parseRemovedSessionsPage({ sessions: [removedSession()], retentionDays: 30 }).sessions[0].id, "session-1");
  assert.throws(() => parseRemovedSessionsPage({ sessions: [removedSession()], retentionDays: 0 }), /保留天数/);

  const previousFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = previousFetch; });
  const calls = [];
  globalThis.fetch = async (input, init) => {
    calls.push({ url: String(input), method: init?.method ?? "GET" });
    if (String(input).endsWith("/remove?projectId=chat")) {
      return new Response(JSON.stringify({ state: "removed", session: removedSession() }), { status: 200 });
    }
    if (init?.method === "PATCH") {
      return new Response(JSON.stringify({ sessionId: "session-1", name: "Renamed" }), { status: 200 });
    }
    if (String(input).includes("/restore?")) {
      return new Response(JSON.stringify({ state: "active", sessionId: "session-1" }), { status: 200 });
    }
    if (init?.method === "DELETE") {
      return new Response(JSON.stringify({ state: "purged", sessionId: "session-1", purgedAt: "2026-09-03T00:00:00.000Z" }), { status: 200 });
    }
    if (init?.method === "PUT") {
      return new Response(JSON.stringify({ removedRetentionDays: 14 }), { status: 200 });
    }
    return new Response(JSON.stringify({ sessions: [removedSession()], retentionDays: 30 }), { status: 200 });
  };

  assert.equal((await fetchRemovedSessions("chat")).sessions.length, 1);
  assert.equal((await removeSession("chat", "session-1")).id, "session-1");
  assert.equal(await renameSession("chat", "session-1", "Renamed"), "Renamed");
  await restoreRemovedSession("chat", "session-1");
  await purgeRemovedSession("chat", "session-1");
  assert.equal(await updateRemovedSessionRetention("chat", 14), 14);
  assert.deepEqual(calls.map((call) => call.method), ["GET", "POST", "PATCH", "POST", "DELETE", "PUT"]);
});

test("Session removal mutations surface backend failures", async (t) => {
  const previousFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = previousFetch; });
  globalThis.fetch = async () => new Response(JSON.stringify({ statusMessage: "Session正在运行" }), { status: 409 });
  await assert.rejects(removeSession("chat", "session-1"), /Session正在运行/);
});
