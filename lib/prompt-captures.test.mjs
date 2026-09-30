import assert from "node:assert/strict";
import test from "node:test";
import {
  groupPromptCaptures,
  parsePromptCaptureDetail,
  parsePromptCaptureList,
  regionLabelKey,
} from "./prompt-captures.ts";

function record(overrides = {}) {
  return {
    requestId: "req-1",
    seq: 1,
    timestamp: "2026-09-30T02:00:00.000Z",
    kind: "agent",
    turn: { source: "workflow", workflowId: "minimal-pi-coding-agent", workflowInvocationId: "inv-1", stageId: "execute" },
    agent: { agentId: "pi-coding-agent", agentName: "Pi Coding Agent" },
    model: { provider: "debug-local", modelId: "debug-model", api: "openai-completions" },
    payloadChars: 1200,
    regions: {
      parsed: true,
      api: "openai-completions",
      systemPromptChars: 500,
      systemSections: [{ kind: "pi-base", label: "系统基础与资源", chars: 200 }],
      messageCount: 3,
      regionCounts: { "injected-instruction": 1, "current-user-message": 1, "assistant": 1 },
      toolCount: 5,
    },
    ...overrides,
  };
}

test("list responses parse into typed records and reject incomplete payloads", () => {
  const list = parsePromptCaptureList({ sessionId: "s-1", count: 1, records: [record()] });
  assert.equal(list.sessionId, "s-1");
  assert.equal(list.records[0].agent.agentName, "Pi Coding Agent");
  assert.equal(list.records[0].regions.regionCounts["tool-result"], undefined);
  assert.equal("messages" in list.records[0].regions, false);
  assert.throws(() => parsePromptCaptureList({ records: "no" }), /Prompt记录列表/);
});

test("detail responses keep the per-message region list for filtering", () => {
  const detail = parsePromptCaptureDetail({
    record: record({ regions: record().regions }),
    payload: { messages: [{ role: "system", content: "system" }, { role: "user", content: "hi" }], tools: [{ function: { name: "read" } }] },
  });
  assert.equal(detail.payload.messages?.length, 2);
  assert.equal(detail.record.regions.systemSections.length, 1);
});

test("requests group by workflow invocation; direct turns group by their own key", () => {
  const list = parsePromptCaptureList({ sessionId: "s", count: 3, records: [
      record(),
      record({ requestId: "req-2", seq: 2, turn: { source: "workflow", workflowId: "minimal-pi-coding-agent", workflowInvocationId: "inv-1", stageId: "remember" } }),
      record({ requestId: "req-3", seq: 1, kind: "direct", turn: { source: "direct" }, agent: { agentId: "nexus" }, timestamp: "2026-09-30T03:00:00.000Z" }),
    ] });
  const groups = groupPromptCaptures(list.records);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].workflowId, "minimal-pi-coding-agent");
  assert.equal(groups[0].records.length, 2);
  assert.equal(groups[1].workflowId, null);
  assert.equal(groups[1].records[0].agent.agentId, "nexus");
});

test("region labels map every known region and fall back to unclassified", () => {
  for (const region of ["injected-instruction", "current-user-message", "history-user", "assistant", "tool-result", "unclassified"]) {
    assert.match(regionLabelKey(region), /^promptCapture\.region\./);
  }
});
