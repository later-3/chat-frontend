import assert from "node:assert/strict";
import test from "node:test";
import { parseSessionListPage } from "./session-list-browser.ts";

function session(overrides = {}) {
  return {
    path: "/sessions/session-1.jsonl",
    id: "session-1",
    cwd: "/workspace",
    created: "2026-09-04T00:00:00.000Z",
    modified: "2026-09-04T00:01:00.000Z",
    messageCount: 2,
    firstMessage: "hello",
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
