import assert from "node:assert/strict";
import test from "node:test";
import {
  readWorkflowConfigDraft,
  removeSubmittedWorkflowConfig,
  writeWorkflowConfigDraft,
} from "./workflow-config-draft-store.ts";

function storage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
    clear: () => values.clear(),
    key: (index) => [...values.keys()][index] ?? null,
    get length() { return values.size; },
  };
}

const firstConfig = {
  agent: {
    promptResources: [{
      id: "rule-1",
      target: { type: "personal" },
      selectedBy: "user",
    }],
  },
};

test("Workflow configuration drafts survive reload and reject malformed values", () => {
  const local = storage();
  writeWorkflowConfigDraft("project:session", {
    configs: { direct: firstConfig },
    dirtyWorkflowIds: ["direct"],
  }, local);
  assert.deepEqual(readWorkflowConfigDraft("project:session", local), {
    configs: { direct: firstConfig },
    dirtyWorkflowIds: ["direct"],
  });

  local.setItem("chat.workflow-config-draft.v1:broken", JSON.stringify({
    schemaVersion: 1,
    configs: { direct: { agent: { promptResources: [{ id: "missing-target", selectedBy: "user" }] } } },
    dirtyWorkflowIds: ["direct"],
  }));
  assert.equal(readWorkflowConfigDraft("broken", local), null);
});

test("a completed run clears only the exact configuration it submitted", () => {
  const laterEdit = {
    agent: {
      promptResources: [{
        id: "rule-2",
        target: { type: "project", projectId: "chat" },
        selectedBy: "user",
      }],
    },
  };
  const changedWhileRunning = {
    configs: { direct: laterEdit, planning: { planner: {} } },
    dirtyWorkflowIds: ["direct", "planning"],
  };
  assert.deepEqual(
    removeSubmittedWorkflowConfig(changedWhileRunning, "direct", firstConfig),
    changedWhileRunning,
  );

  assert.deepEqual(
    removeSubmittedWorkflowConfig({
      configs: { direct: firstConfig, planning: { planner: {} } },
      dirtyWorkflowIds: ["direct", "planning"],
    }, "direct", firstConfig),
    {
      configs: { planning: { planner: {} } },
      dirtyWorkflowIds: ["planning"],
    },
  );
});
