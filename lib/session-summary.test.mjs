import assert from "node:assert/strict";
import test from "node:test";
import { mergeSessionSummary, overlaySelectedSession } from "./session-summary.ts";

function session(overrides = {}) {
  return {
    path: "",
    id: "session-1",
    cwd: "/project",
    created: "2026-09-02T10:20:20.356Z",
    modified: "2026-09-02T10:20:20.735Z",
    messageCount: 1,
    firstMessage: "Explain the deployment",
    projectId: "project-1",
    projectKey: "project-1",
    ...overrides,
  };
}

test("a lagging persisted summary cannot erase the optimistic first message", () => {
  const optimistic = session();
  const headerOnly = session({
    path: "/sessions/session-1.jsonl",
    modified: "2026-09-02T10:20:20.356Z",
    messageCount: 0,
    firstMessage: "",
  });

  assert.deepEqual(mergeSessionSummary(optimistic, headerOnly), {
    ...headerOnly,
    modified: optimistic.modified,
    messageCount: 1,
    firstMessage: "Explain the deployment",
  });
});

test("a complete persisted summary replaces the optimistic counters", () => {
  const persisted = session({
    path: "/sessions/session-1.jsonl",
    modified: "2026-09-02T10:21:10.948Z",
    messageCount: 10,
  });

  assert.deepEqual(mergeSessionSummary(session(), persisted), persisted);
});

test("the selected Session is shown before the session list catches up", () => {
  const selected = session();
  const other = session({ id: "session-2", firstMessage: "Other" });

  assert.deepEqual(overlaySelectedSession([other], selected), [selected, other]);
  assert.equal(overlaySelectedSession([session({ messageCount: 0, firstMessage: "" })], selected).length, 1);
  assert.equal(overlaySelectedSession([session({ messageCount: 0, firstMessage: "" })], selected)[0].firstMessage,
    "Explain the deployment");
});
