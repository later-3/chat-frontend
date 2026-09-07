import assert from "node:assert/strict";
import test from "node:test";
import { ordinarySessions, sessionLongAgentId, sessionSidebarPanel } from "./session-owner.ts";

const base = {
  path: "/sessions/session.jsonl",
  id: "ordinary",
  cwd: "/workspace",
  created: "2026-09-06T00:00:00.000Z",
  modified: "2026-09-06T00:00:00.000Z",
  messageCount: 0,
  firstMessage: "",
  owner: { type: "ordinary" },
};
const longAgent = {
  ...base,
  id: "long-agent",
  owner: {
    type: "long-agent",
    longAgentId: "nexus",
    projectLongAgentId: "project-long-agent:daily:nexus",
  },
};

test("Session owner synchronously selects execution and sidebar routes", () => {
  assert.equal(sessionLongAgentId(base), null);
  assert.equal(sessionLongAgentId(longAgent), "nexus");
  assert.equal(sessionSidebarPanel(base), "sessions");
  assert.equal(sessionSidebarPanel(longAgent), "long-agents");
  assert.deepEqual(ordinarySessions([longAgent, base]).map((session) => session.id), ["ordinary"]);
});
