import test from "node:test";
import assert from "node:assert/strict";
import { parseFriendTasks, readPendingTaskCommand, savePendingTaskCommand } from "./friend-tasks.ts";
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
