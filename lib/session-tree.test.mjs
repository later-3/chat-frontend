import assert from "node:assert/strict";
import test from "node:test";
import { buildSidebarSessionTree } from "./session-tree.ts";

function session(id, parentSessionId, attention) {
  return {
    id,
    path: `/sessions/${id}.jsonl`,
    cwd: "/workspace",
    created: "2026-09-04T00:00:00.000Z",
    modified: `2026-09-04T00:00:0${id.length}.000Z`,
    messageCount: 1,
    firstMessage: id,
    ...(parentSessionId === undefined ? {} : { parentSessionId }),
    ...(attention === undefined
      ? {}
      : { attention: { kind: attention, workflowId: "planning-execution", updatedAt: "2026-09-04T00:00:00.000Z" } }),
  };
}

test("Session tree preserves nested Workflow Sessions and folds human attention into ancestors", () => {
  const [root] = buildSidebarSessionTree([
    session("root"),
    session("child", "root", "review"),
    session("grandchild", "child", "clarification"),
  ]);

  assert.equal(root.session.id, "root");
  assert.equal(root.attentionCount, 2);
  assert.equal(root.children[0].session.id, "child");
  assert.equal(root.children[0].attentionCount, 2);
  assert.equal(root.children[0].children[0].session.id, "grandchild");
  assert.equal(root.children[0].children[0].attentionCount, 1);
});
