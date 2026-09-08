import assert from "node:assert/strict";
import test from "node:test";
import {
  parseChatWorkflowPromptInput,
  parseChatWorkflowPromptResult,
  parseChatWorkflowRunAccepted,
} from "./chat-workflow-contract.ts";

test("prompt input supports new and existing sessions", () => {
  assert.deepEqual(
    parseChatWorkflowPromptInput({
      projectId: "chat",
      cwd: "/repo",
      prompt: "你好",
      workflow: "minimal-pi-coding-agent",
    }),
    { projectId: "chat", cwd: "/repo", prompt: "你好", workflow: "minimal-pi-coding-agent" },
  );
  assert.deepEqual(
    parseChatWorkflowPromptInput({
      projectId: "chat",
      cwd: "/repo",
      prompt: "review",
      workflow: "minimal-pi-coding-agent",
      agentConfigs: {
        "pi-coding-agent": {
          append: ["/configs/review.json"],
          promptResources: [{
            id: "architecture-rule",
            target: { type: "project", projectId: "chat" },
            selectedBy: "agent",
            reason: "matches the current module review",
          }],
          resources: {
            mode: "explicit",
            skillPaths: ["/skills/review"],
            extensionPaths: [],
            pluginSources: [],
          },
        },
      },
    }).agentConfigs,
    {
      "pi-coding-agent": {
        append: ["/configs/review.json"],
        promptResources: [{
          id: "architecture-rule",
          target: { type: "project", projectId: "chat" },
          selectedBy: "agent",
          reason: "matches the current module review",
        }],
        resources: {
          mode: "explicit",
          skillPaths: ["/skills/review"],
          extensionPaths: [],
          pluginSources: [],
        },
      },
    },
  );
  assert.deepEqual(
    parseChatWorkflowPromptInput({
      projectId: "chat",
      cwd: "/repo",
      prompt: "继续",
      sessionId: "session-1",
      workflow: "planning-execution",
    }),
    {
      projectId: "chat",
      cwd: "/repo",
      prompt: "继续",
      sessionId: "session-1",
      workflow: "planning-execution",
    },
  );
  assert.throws(
    () => parseChatWorkflowPromptInput({
      projectId: "chat",
      cwd: "/repo",
      prompt: " ",
      workflow: "minimal-pi-coding-agent",
    }),
    /prompt/,
  );
  assert.throws(
    () => parseChatWorkflowPromptInput({
      projectId: "chat",
      cwd: "/repo",
      prompt: "hello",
      sessionId: "",
      workflow: "minimal-pi-coding-agent",
    }),
    /sessionId/,
  );
  assert.deepEqual(
    parseChatWorkflowPromptInput({ projectId: "chat", cwd: "/repo", prompt: "hello", workflow: "future-workflow" }),
    { projectId: "chat", cwd: "/repo", prompt: "hello", workflow: "future-workflow" },
  );
  assert.throws(
    () => parseChatWorkflowPromptInput({ projectId: "chat", cwd: "/repo", prompt: "hello", workflow: "" }),
    /workflow必须是非空字符串/,
  );
});

const VALID_IMAGE = {
  type: "image",
  // 1x1 transparent PNG.
  data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  mimeType: "image/png",
};

test("prompt input carries validated image attachments", () => {
  assert.deepEqual(
    parseChatWorkflowPromptInput({
      projectId: "chat",
      cwd: "/repo",
      prompt: "看这张图",
      workflow: "minimal-pi-coding-agent",
      images: [VALID_IMAGE],
    }),
    {
      projectId: "chat",
      cwd: "/repo",
      prompt: "看这张图",
      workflow: "minimal-pi-coding-agent",
      images: [VALID_IMAGE],
    },
  );
  // An image-only message does not require a text prompt.
  assert.deepEqual(
    parseChatWorkflowPromptInput({
      projectId: "chat",
      cwd: "/repo",
      prompt: "",
      workflow: "minimal-pi-coding-agent",
      images: [VALID_IMAGE],
    }).images,
    [VALID_IMAGE],
  );
  assert.throws(
    () => parseChatWorkflowPromptInput({
      projectId: "chat",
      cwd: "/repo",
      prompt: "",
      workflow: "minimal-pi-coding-agent",
    }),
    /prompt/,
  );
  assert.throws(
    () => parseChatWorkflowPromptInput({
      projectId: "chat",
      cwd: "/repo",
      prompt: "x",
      workflow: "minimal-pi-coding-agent",
      images: [{ ...VALID_IMAGE, type: "file" }],
    }),
    /Each attachment must be an image/,
  );
});

test("accepted Workflow Run includes its durable Session identity", () => {
  assert.deepEqual(parseChatWorkflowRunAccepted({
    runId: "wrun_1",
    workflowInvocationId: "invocation_1",
    sessionId: "session_1",
    isNewSession: true,
  }), {
    runId: "wrun_1",
    workflowInvocationId: "invocation_1",
    sessionId: "session_1",
    isNewSession: true,
  });
  assert.throws(
    () => parseChatWorkflowRunAccepted({ runId: "wrun_1", workflowInvocationId: "invocation_1" }),
    /完整的Workflow Run引用/,
  );
});

test("completed Workflow results are validated before rendering", () => {
  const response = parseChatWorkflowPromptResult({
    runId: "wrun_1",
    result: {
      text: "你好",
      sessionId: "pi_1",
      sessionFile: "/tmp/pi_1.jsonl",
      model: { provider: "test", modelId: "model" },
    },
  });
  assert.equal(response.result.text, "你好");
  assert.equal(response.result.model?.modelId, "model");
});

test("incomplete Workflow results are rejected", () => {
  assert.throws(
    () => parseChatWorkflowPromptResult({ runId: "wrun_1", result: { text: "missing ids" } }),
    /无效结果/,
  );
});
