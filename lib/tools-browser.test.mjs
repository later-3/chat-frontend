import assert from "node:assert/strict";
import test from "node:test";
import { fetchChatTools, parseChatToolsResponse } from "./tools-browser.ts";

function payload() {
  return {
    schemaVersion: 1,
    projectId: "chat",
    tools: [{
      name: "memory_search",
      label: "Search memory",
      description: "Search memory",
      address: "system:tool/memory_search",
      sourceInfo: { source: "chat-system", scope: "system", origin: "builtin" },
      toolVersion: "system:memory-search@1",
      risk: "read-only",
      permissions: ["memory:read"],
      consumers: [{
        workflowId: "planning-execution",
        agentId: "planner",
        source: "workflow-default",
        enabled: true,
      }],
    }],
    diagnostics: [],
  };
}

test("Tool catalog validates system metadata and reverse Agent usage", () => {
  const result = parseChatToolsResponse(payload());
  assert.equal(result.tools[0].address, "system:tool/memory_search");
  assert.equal(result.tools[0].consumers[0].agentId, "planner");
  assert.throws(
    () => parseChatToolsResponse({ ...payload(), tools: [{ ...payload().tools[0], risk: "silent-root" }] }),
    /risk/,
  );
});

test("Tool catalog retains file versions for Project extension Tools", () => {
  const value = payload();
  value.tools.push({
    name: "project_lookup",
    label: "Project lookup",
    description: "Look up Project data",
    address: "project/chat:tool/project_lookup",
    sourceInfo: { source: "local", scope: "project", origin: "package" },
    version: {
      kind: "file",
      size: 128,
      modifiedAt: "2026-09-01T10:00:00.000Z",
      contentHash: "sha256:fixture",
    },
    permissions: [],
    consumers: [],
  });
  const result = parseChatToolsResponse(value);
  assert.equal(result.tools[1].version.contentHash, "sha256:fixture");
});

test("Tool catalog is discovered from the Backend for the selected Project", async (t) => {
  const previousFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = previousFetch; });
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    return new Response(JSON.stringify(payload()), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  const result = await fetchChatTools("chat");
  assert.equal(result.projectId, "chat");
  assert.deepEqual(calls, ["/api/tools?projectId=chat"]);
});
