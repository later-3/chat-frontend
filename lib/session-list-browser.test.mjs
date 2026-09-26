import assert from "node:assert/strict";
import test from "node:test";
import { fetchProjectSessionById, parseSessionInfo, parseSessionListPage } from "./session-list-browser.ts";

function session(overrides = {}) {
  return {
    path: "/sessions/session-1.jsonl",
    id: "session-1",
    cwd: "/workspace",
    created: "2026-09-04T00:00:00.000Z",
    modified: "2026-09-04T00:01:00.000Z",
    messageCount: 2,
    firstMessage: "hello",
    owner: { type: "ordinary" },
    projectRoot: "/workspace",
    projectAvailable: true,
    projectKey: "project-1",
    transient: false,
    sessionSource: "chat",
    readOnly: false,
    ...overrides,
  };
}

test("Session list validates Child lineage and durable review attention", () => {
  const page = parseSessionListPage({
    sessions: [session({
      parentSessionId: "parent-1",
      attention: {
        kind: "review",
        workflowId: "planning-execution",
        updatedAt: "2026-09-04T00:02:00.000Z",
      },
    })],
    runningSessionIds: [],
  });
  assert.equal(page.sessions[0].parentSessionId, "parent-1");
  assert.equal(page.sessions[0].attention?.kind, "review");
});

test("Session list rejects malformed attention instead of rendering it", () => {
  assert.throws(
    () => parseSessionListPage({
      sessions: [session({ attention: { kind: "waiting", workflowId: "planning-execution" } })],
      runningSessionIds: [],
    }),
    /待确认状态/,
  );
});

test("Session owner is mandatory and strictly distinguishes ordinary from Long Agent Sessions", () => {
  assert.deepEqual(parseSessionInfo(session()).owner, { type: "ordinary" });
  assert.deepEqual(parseSessionInfo(session({
    owner: {
      type: "long-agent",
      longAgentId: "nexus",
      projectLongAgentId: "project-long-agent:daily:nexus",
    },
  })).owner, {
    type: "long-agent",
    longAgentId: "nexus",
    projectLongAgentId: "project-long-agent:daily:nexus",
  });
  assert.throws(() => parseSessionInfo(session({ owner: undefined })), /Session owner/);
  assert.throws(() => parseSessionInfo(session({ owner: { type: "ordinary", longAgentId: "nexus" } })), /普通Session owner/);
  assert.throws(() => parseSessionInfo(session({ owner: { type: "long-agent", longAgentId: "nexus" } })), /长期Agent Session owner/);
});

test("opening an existing Session uses Backend migration resolution and checks identity", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const calls = [];
  const target = session({
    id: "long-session",
    owner: {
      type: "long-agent",
      longAgentId: "nexus",
      projectLongAgentId: "project-long-agent:daily:nexus",
    },
  });
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return Response.json({ session: target });
  };
  assert.deepEqual(await fetchProjectSessionById("daily", "long-session"), parseSessionInfo(target));
  assert.equal(calls[0].url, // Same query flags as the公共聊天读取: the response is reused instead of downloaded twice.
    "/api/sessions/long-session?projectId=daily&deferThinking=1&deferMedia=1");
  assert.equal(calls[0].init.credentials, "same-origin");
  await assert.rejects(fetchProjectSessionById("daily", "missing"), /不匹配的Session/);
});

test("two navigation readers of the same deep-link share one request", async () => {
  const target = session({ id: "shared-session" });
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 5));
    return Response.json({ session: target });
  };
  const [first, second] = await Promise.all([
    fetchProjectSessionById("daily", "shared-session"),
    fetchProjectSessionById("daily", "shared-session"),
  ]);
  assert.equal(calls, 1, "the same navigation must download the session once");
  assert.deepEqual(first, second);
  // A DIFFERENT session is not served from the previous one.
  globalThis.fetch = async (url) => {
    calls += 1;
    return Response.json({ session: session({ id: "other-session", path: String(url) }) });
  };
  const other = await fetchProjectSessionById("daily", "other-session");
  assert.equal(other.id, "other-session");
  assert.equal(calls, 2, "a different session always reads the backend");
});
