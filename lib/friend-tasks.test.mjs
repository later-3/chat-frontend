import test from "node:test";
import assert from "node:assert/strict";
import { parseFriendTasks, buildFriendTaskRows, readPendingTaskCommand, savePendingTaskCommand } from "./friend-tasks.ts";
const task = { id: "t", longAgentId: "f", revision: 2, name: "阅读", prompt: "read", contextProjectId: null, timeZone: "Asia/Shanghai", schedule: { kind: "cron", expression: "0 8 * * *" }, missed: "skip", overlap: "queue-one", status: "active", createdAt: "2026-09-20T00:00:00Z", updatedAt: "2026-09-20T00:00:00Z", projection: { taskId: "t", revision: 2, nextAt: null } };
const document = { schemaVersion: 2, longAgentId: "f", migration: "complete", projectionError: null, tasks: [task], occurrences: [] };
test("task response rejects foreign ownership, stale projection and invalid timezone", () => {
  assert.equal(parseFriendTasks(document, "f").tasks[0].name, "阅读");
  assert.throws(() => parseFriendTasks(document, "other"));
  assert.throws(() => parseFriendTasks({ ...document, tasks: [{ ...task, projection: { ...task.projection, revision: 1 } }] }, "f"));
  assert.throws(() => parseFriendTasks({ ...document, tasks: [{ ...task, timeZone: "unknown" }] }, "f"));
});
test("unconfirmed execution preserves its request across remounts and is isolated by Friend", t => {
  const map = new Map(); Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: { getItem: key => map.get(key), setItem: (key, value) => map.set(key, value), removeItem: key => map.delete(key) } }); t.after(() => delete globalThis.sessionStorage);
  const command = { operation: "run", taskId: "t", expectedRevision: 2, requestId: "stable" };
  savePendingTaskCommand("f", command); assert.deepEqual(readPendingTaskCommand("f"), command); assert.equal(readPendingTaskCommand("g"), null);
  savePendingTaskCommand("f", null); assert.equal(readPendingTaskCommand("f"), null);
});
test("Nitro errors retain the actionable task message", async t => {
  const { requestFriendTasks } = await import("./friend-tasks.ts");
  t.mock.method(globalThis, "fetch", async () => Response.json({ error: true, status: 409, message: "任务已修改，请刷新" }, { status: 409 }));
  await assert.rejects(requestFriendTasks("f", { operation: "pause", taskId: "t", expectedRevision: 1 }), /任务已修改/);
});
test("task panel rows split tasks, duties and executions with standalone-work dedup", () => {
  const duty = { ...task, id: "d1", dutyId: "duty-1", name: "整理", projection: { taskId: "d1", revision: 2, nextAt: "2026-09-21T00:00:00Z" } };
  const workItem = { work: { id: "work-1", longAgentId: "f", sessionId: "s1", originSessionId: "o", originEntryId: null, contextProjectId: "p1", requestId: "r1", payloadHash: "a".repeat(64), title: "工作标题", createdAt: "2026-09-21T02:00:00Z" }, execution: { status: "running", capabilities: { cancel: true } } };
  const data = {
    schemaVersion: 2, longAgentId: "f", migration: "complete", projectionError: null,
    tasks: [task, duty],
    occurrences: [
      { id: "occ-1", taskId: "t", revision: 2, source: "time", scheduledAt: "2026-09-21T03:00:00Z", state: "blocked", reason: "overlap", workId: null, work: null },
      { id: "occ-2", taskId: "t", revision: 2, source: "manual", scheduledAt: "2026-09-21T04:00:00Z", state: "started", reason: null, workId: "work-1", work: { ...workItem, displayTitle: "手动标题" } },
    ],
  };
  const standalone = { ...workItem, work: { ...workItem.work, id: "work-2", createdAt: "2026-09-21T01:00:00Z" }, displayTitle: undefined };
  const rows = buildFriendTaskRows(data, [workItem, standalone]);
  assert.deepEqual(rows.plan.map(row => [row.key, row.badge, row.timeAt]), [["t", "task", null]], "a plain task is a plan row without a next run");
  assert.deepEqual(rows.duty.map(row => [row.key, row.badge, row.statusKey]), [["d1", "duty", "taskPanel.taskStatus.active"]], "a duty-owned task lands in the duty group");
  assert.deepEqual(rows.executions.map(row => [row.key, row.badge]), [["occ-1", "exec"], ["occ-2", "exec"], ["work-2", "work"]], "executions sort newest first (an occurrence with work sorts by its work creation) and the occurrence's own work is not repeated as a standalone row");
  const blocked = rows.executions[0];
  assert.equal(blocked.title, "阅读");
  assert.equal(blocked.statusKey, "taskPanel.occurrence.blocked");
  assert.equal(blocked.reason, "overlap");
  assert.equal(blocked.workId, null);
  const withWork = rows.executions[1];
  assert.equal(withWork.title, "手动标题");
  assert.equal(withWork.statusKey, "friendWork.status.running");
  assert.equal(withWork.workId, "work-1");
  assert.equal(withWork.sessionId, "s1");
  assert.ok(withWork.execution.capabilities.cancel);
  assert.equal(rows.executions[2].title, "工作标题");
});
test("task panel rows start empty before the first poll", () => {
  assert.deepEqual(buildFriendTaskRows(null, []), { plan: [], duty: [], executions: [] });
});
