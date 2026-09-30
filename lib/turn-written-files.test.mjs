import test from "node:test";
import assert from "node:assert/strict";
import { extractTurnWrittenFiles } from "./turn-written-files.ts";

const revision = `sha256:${"a".repeat(64)}`;
const call = (toolName, input, toolCallId = "c") => ({ type: "toolCall", toolName, input, toolCallId });
const results = (details, isError = false) => new Map([["c", { role: "toolResult", toolCallId: "c", content: [], details, isError }]]);
test("Agent Memory opens its owner-relative resource, including historical receipts", () => {
  const content = [call("agent_memory_write", { path: "outreach/cadence.md", longAgentId: "forged" })];
  const file = { path: "outreach/cadence.md", revision };
  assert.deepEqual(extractTurnWrittenFiles(content, results({ file }), "/project", "friend"), [
    { kind: "agent-memory", longAgentId: "friend", path: file.path, revision },
  ]);
  assert.equal(extractTurnWrittenFiles(content, results({ longAgentId: "trusted", file }), "/project", "friend")[0].longAgentId, "trusted");
  assert.deepEqual(extractTurnWrittenFiles(content, results({ file }), "/project"), [], "unknown owner never becomes a project file");
  assert.deepEqual(extractTurnWrittenFiles(content, results({ file }, true), "/project", "friend"), []);
  assert.deepEqual(extractTurnWrittenFiles(content, results({ file: { path: "../secret.md", revision } }), "/project", "friend"), []);
});
test("project writes keep their own paths, other memory domains cannot masquerade as files", () => {
  assert.deepEqual(extractTurnWrittenFiles([call("write", { path: "src/file.ts" })], results({}), "/project"), [{ filePath: "/project/src/file.ts" }]);
  assert.deepEqual(extractTurnWrittenFiles([call("project_memory_write", { path: "entry" })], results({}), "/project"), []);
});
