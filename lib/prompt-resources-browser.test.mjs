import assert from "node:assert/strict";
import test from "node:test";
import {
  fetchPromptResource,
  fetchPromptResourceHistory,
  fetchPromptResources,
} from "./prompt-resources-browser.ts";

function resource(revision = 1) {
  return {
    schemaVersion: 1,
    target: { type: "project", projectId: "chat" },
    id: "resource-1",
    revision,
    kind: "rule",
    title: "Module boundary",
    purpose: "Keep one responsibility per module",
    content: "Keep interfaces narrow.",
    tags: ["architecture"],
    status: "active",
    sources: [{
      type: "session",
      projectId: "chat",
      sessionId: "session-1",
      workflowInvocationId: "invocation-1",
      entryIds: ["entry-1"],
      context: "An oversized module was reviewed.",
      capturedAt: "2026-08-30T06:00:00.000Z",
    }],
    author: { type: "agent", agentId: "rule-curator-agent" },
    createdAt: "2026-08-30T06:00:00.000Z",
  };
}

test("Prompt resource browser sends search input and validates resources", async (t) => {
  const previousFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = previousFetch; });
  let requested = "";
  globalThis.fetch = async (input) => {
    requested = String(input);
    return new Response(JSON.stringify({ resources: [resource()] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  const resources = await fetchPromptResources("chat", "module boundary");
  assert.match(requested, /status=all/);
  assert.match(requested, /q=module\+boundary/);
  assert.equal(resources[0].sources[0].sessionId, "session-1");
});

test("Prompt resource browser validates revision history", async (t) => {
  const previousFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = previousFetch; });
  globalThis.fetch = async () => new Response(JSON.stringify({
    revisions: [resource(1), resource(2)],
  }), { status: 200, headers: { "Content-Type": "application/json" } });

  assert.deepEqual((await fetchPromptResourceHistory("chat", resource())).map((item) => item.revision), [1, 2]);
});

test("Prompt resource browser reads an exact cross-Project Target", async (t) => {
  const previousFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = previousFetch; });
  let requested = "";
  globalThis.fetch = async (input) => {
    requested = String(input);
    return new Response(JSON.stringify({ resource: resource() }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  const exact = await fetchPromptResource("current", {
    id: "resource-1",
    target: { type: "project", projectId: "chat" },
  });
  assert.match(requested, /target=project/);
  assert.match(requested, /targetProjectId=chat/);
  assert.equal(exact.id, "resource-1");
});

test("Prompt resource browser rejects malformed network data", async (t) => {
  const previousFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = previousFetch; });
  globalThis.fetch = async () => new Response(JSON.stringify({ resources: [{ id: "broken" }] }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

  await assert.rejects(fetchPromptResources("chat"), /无效Prompt资源/);
});

test("Prompt resource browser rejects malformed nested provenance", async (t) => {
  const previousFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = previousFetch; });
  globalThis.fetch = async () => new Response(JSON.stringify({
    resources: [{
      ...resource(),
      sources: [{
        type: "session",
        entryIds: [42],
        context: "broken",
        capturedAt: "not-a-date",
      }],
    }],
  }), { status: 200, headers: { "Content-Type": "application/json" } });

  await assert.rejects(fetchPromptResources("chat"), /无效Prompt资源来源/);
});
