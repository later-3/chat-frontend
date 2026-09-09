import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parseChatRootConfig } from "./chat-workflow-contract.ts";
import {
  clearChatAgentToolConfig,
  clearChatAgentModelConfig,
  fetchChatModelCatalog,
  inspectChatWorkflowAgent,
  parseChatWorkflowSummaries,
  saveChatAgentModelConfig,
  saveChatAgentToolConfig,
} from "./chat-workflows-browser.ts";

function agent() {
  return {
    schemaVersion: 1,
    id: "agent-1",
    name: "Agent 1",
    description: "Test Agent",
    systemPrompt: { mode: "pi-default" },
    customInstructions: [],
    tools: { mode: "pi-default" },
    resources: { mode: "inherit" },
  };
}

test("parses Workflow selector data from the backend registry", () => {
  assert.deepEqual(parseChatWorkflowSummaries({
    workflows: [{
      id: "future-workflow",
      name: "Future Workflow",
      description: "A future Workflow",
      agentCallable: true,
      planReview: false,
      supportsImageInput: true,
      nodes: [],
      agents: [agent()],
    }],
  }), [{
    id: "future-workflow",
    name: "Future Workflow",
    description: "A future Workflow",
    agentCallable: true,
    planReview: false,
    supportsImageInput: true,
    nodes: [],
    agents: [agent()],
  }]);
  // Backends that predate the capability flag project text-only Workflows.
  assert.deepEqual(parseChatWorkflowSummaries({
    workflows: [{
      id: "legacy-workflow",
      name: "Legacy Workflow",
      description: "",
      agentCallable: false,
      planReview: false,
      nodes: [],
      agents: [],
    }],
  }), [{
    id: "legacy-workflow",
    name: "Legacy Workflow",
    description: "",
    agentCallable: false,
    planReview: false,
    supportsImageInput: false,
    nodes: [],
    agents: [],
  }]);
});

test("Agent resolve responses are validated through every nested resource boundary", async (t) => {
  const previousFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = previousFetch; });
  const response = {
    agent: {
      ...agent(),
      sources: [{ kind: "workflow-default" }],
      effectiveModel: null,
      effectiveThinkingLevel: "off",
      durableConfig: null,
    },
    prompt: {
      final: "system prompt",
      base: { mode: "pi-default", sourcePath: null },
      append: [],
      contextFiles: [],
    },
    tools: [{
      name: "read",
      label: "Read",
      description: "Read a file",
      parameters: { type: "object" },
      promptGuidelines: [],
      sourceInfo: {
        path: "<builtin:read>",
        source: "builtin",
        scope: "temporary",
        origin: "top-level",
      },
      address: "runtime:tool/read",
      version: null,
      active: true,
    }],
    skills: [],
    extensions: [],
    plugins: [],
    prompts: [],
    promptResources: [],
    diagnostics: [],
  };
  globalThis.fetch = async () => new Response(JSON.stringify(response), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
  const parsed = await inspectChatWorkflowAgent("workflow-1", "agent-1", "chat", "/repo");
  assert.equal(parsed.tools[0].sourceInfo.scope, "temporary");

  globalThis.fetch = async () => new Response(JSON.stringify({
    ...response,
    tools: [{ ...response.tools[0], sourceInfo: { path: "broken", source: "builtin", origin: "top-level" } }],
  }), { status: 200, headers: { "Content-Type": "application/json" } });
  await assert.rejects(
    inspectChatWorkflowAgent("workflow-1", "agent-1", "chat", "/repo"),
    /sourceInfo.scope/,
  );
});

test("rejects incomplete Workflow selector data", () => {
  assert.throws(
    () => parseChatWorkflowSummaries({ workflows: [{ id: "missing-name" }] }),
    /无效的Workflow定义/,
  );
});

test("the Agent configuration page exposes the Backend-resolved Skills and active Tools", () => {
  const source = readFileSync(new URL("../components/WorkflowAgentConfigDialog.tsx", import.meta.url), "utf8");
  assert.match(source, /实际装配能力/);
  assert.match(source, /inspection\.skills\.map/);
  assert.match(source, /inspection\.tools\.filter\(\(tool\) => tool\.active\)/);
});

test("fetchChatModelCatalog validates the Backend model catalog", async (t) => {
  const previousFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = previousFetch; });
  globalThis.fetch = async () => new Response(JSON.stringify({
    schemaVersion: 1,
    providers: [{ id: "p1", name: "Provider 1", authConfigured: true }],
    models: [{
      provider: "p1",
      modelId: "m1",
      name: "Model 1",
      reasoning: true,
      contextWindow: 128_000,
      maxTokens: 8_192,
      authConfigured: true,
    }],
  }), { status: 200, headers: { "Content-Type": "application/json" } });
  const catalog = await fetchChatModelCatalog();
  assert.equal(catalog.providers[0].authConfigured, true);
  assert.equal(catalog.models[0].modelId, "m1");

  globalThis.fetch = async () => new Response(JSON.stringify({ schemaVersion: 1, providers: [], models: {} }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
  await assert.rejects(fetchChatModelCatalog(), /models\[|\u6a21\u578b\u76ee\u5f55/);
});

test("Agent model configuration is persisted through the Backend and restorable", async (t) => {
  const previousFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = previousFetch; });
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({ schemaVersion: 1, model: { provider: "p1", modelId: "m1" } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  await saveChatAgentModelConfig("wf-1", "agent-1", "proj-1", {
    model: { provider: "p1", modelId: "m1" },
    thinkingLevel: "high",
  });
  await saveChatAgentModelConfig("wf-1", "agent-1", "proj-1", { model: null });
  await clearChatAgentModelConfig("wf-1", "agent-1", "proj-1");
  assert.deepEqual(calls.map((call) => `${call.init?.method ?? "GET"} ${call.url}`), [
    "PUT /api/workflows/wf-1/agents/agent-1/model-config",
    "PUT /api/workflows/wf-1/agents/agent-1/model-config",
    "DELETE /api/workflows/wf-1/agents/agent-1/model-config?projectId=proj-1",
  ]);
  assert.match(calls[0].init.body, /"modelId":"m1"/);
  assert.match(calls[0].init.body, /"thinkingLevel":"high"/);
  assert.match(calls[1].init.body, /"model":null/);
  assert.doesNotMatch(calls[1].init.body, /thinkingLevel/);

  globalThis.fetch = async () => new Response(
    JSON.stringify({ message: "Provider没有认证: p1" }),
    { status: 400, headers: { "Content-Type": "application/json" } },
  );
  await assert.rejects(
    saveChatAgentModelConfig("wf-1", "agent-1", "proj-1", { model: { provider: "p1", modelId: "m1" } }),
    /Provider没有认证/,
  );
});

test("the Agent configuration page exposes durable model configuration controls", () => {
  const source = readFileSync(new URL("../components/WorkflowAgentConfigDialog.tsx", import.meta.url), "utf8");
  assert.match(source, /模型配置/);
  assert.match(source, /durableConfig/);
  assert.match(source, /saveChatAgentModelConfig/);
  assert.match(source, /clearChatAgentModelConfig/);
  // The durable override binds to durableConfig, never to the merged definition,
  // and clearing a field sends only that field as null.
  assert.match(source, /durableConfig\?\.model/);
  assert.match(source, /\{ model: null \}/);
  assert.match(source, /\{ thinkingLevel: null \}/);
});

test("Agent Tool configuration is persisted through the Backend and restorable", async (t) => {
  const previousFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = previousFetch; });
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({ schemaVersion: 1 }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  await saveChatAgentToolConfig("planning-execution", "planner", "chat", {
    mode: "explicit",
    names: [],
    exclude: [],
    addresses: ["system:tool/memory_search"],
  });
  await clearChatAgentToolConfig("planning-execution", "planner", "chat");
  assert.deepEqual(calls.map((call) => `${call.init?.method ?? "GET"} ${call.url}`), [
    "PUT /api/workflows/planning-execution/agents/planner/tool-config",
    "DELETE /api/workflows/planning-execution/agents/planner/tool-config?projectId=chat",
  ]);
  assert.match(calls[0].init.body, /system:tool\/memory_search/);
});

test("the Agent configuration page auto-discovers selectable rule and experience prompts", () => {
  const source = readFileSync(new URL("../components/WorkflowAgentConfigDialog.tsx", import.meta.url), "utf8");
  assert.match(source, /fetchPromptResources\(projectId/);
  assert.match(source, /type="checkbox"/);
  assert.match(source, /resource\.kind === "rule" \? "规则" : "经验"/);
  assert.match(source, /updatePromptResource\(resource, checked\)/);
});

test("parses the shared .chat root configuration", () => {
  assert.deepEqual(parseChatRootConfig({
    schemaVersion: 1,
    defaultWorkflowId: "memory",
    workflows: {
      memory: { agents: { "memory-agent": { promptFiles: ["/rules/memory.md"] } } },
    },
  }), {
    schemaVersion: 1,
    defaultWorkflowId: "memory",
    workflows: {
      memory: { agents: { "memory-agent": { promptFiles: ["/rules/memory.md"] } } },
    },
    sessions: { removedRetentionDays: 30 },
  });
});
