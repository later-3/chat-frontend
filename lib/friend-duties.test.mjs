import assert from "node:assert/strict";
import test from "node:test";
import { parseFriendDuties } from "./friend-duties.ts";

const work = {
  id: "work-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  longAgentId: "friend",
  sessionId: "s1",
  originSessionId: "s0",
  originEntryId: null,
  contextProjectId: null,
  requestId: "occ-1",
  payloadHash: "a".repeat(64),
  title: "推进",
  createdAt: "2026-09-20T00:00:00Z",
};
const execution = {
  schemaVersion: 1, kind: "friend", workId: work.id, id: "turn-1", longAgentId: "friend", projectId: "friend",
  sessionId: "s1", contextProjectId: null, status: "completed", error: null, acceptedAt: "2026-09-20T00:00:00Z",
  capabilities: { cancel: false, steer: false, followUp: true, images: false },
};
const occurrence = {
  id: "occ-1", taskId: "task-1", revision: 1, source: "manual", scheduledAt: "2026-09-20T00:00:00Z",
  state: "started", reason: null, workId: work.id, work: { work, execution },
};
const duty = {
  id: "duty-" + "a".repeat(32), longAgentId: "friend", revision: 3, goalRevision: 2, status: "active",
  createdAt: "2026-09-20T00:00:00Z", updatedAt: "2026-09-20T01:00:00Z", endedAt: null,
  taskId: "task-1", nextStep: "NEXT", nextCheckAt: null, awaitingMaterial: false,
  name: "道德经学习", objective: "OBJ", materials: ["materials/a.txt"], contextProjectId: null,
  outcome: "OUT", timeZone: "Asia/Shanghai", cadence: { kind: "cron", expression: "0 8 * * *" },
  allowedHours: null, budget: { tokensPerDay: 100 }, totalUnits: 10,
  unitsDone: 2, percent: 20, tokensToday: 60, budgetExhausted: false,
  progress: [{
    id: "prog-1", advancementKey: "occ-1", payloadHash: "b".repeat(64), at: "2026-09-20T00:30:00Z", source: "agent", goalRevision: 2, applied: true,
    summary: "S", evidence: [{ kind: "file", path: "notes/a.md" }], unitsDone: 2, nextStep: "NEXT", nextCheckAt: null, superseded: false,
  }],
  advancements: [{
    advancementKey: "occ-1", workId: work.id, goalRevision: 1, status: "completed", tokens: 60,
    at: "2026-09-20T00:40:00Z", superseded: true,
  }],
  linkedTask: { id: "task-1", revision: 1, status: "active", projection: { taskId: "task-1", revision: 1, nextAt: null } },
  linkedOccurrences: [occurrence],
};
test("LA3 frontend parser accepts a well-formed duty document and rejects foreign identities", () => {
  const parsed = parseFriendDuties({ schemaVersion: 1, longAgentId: "friend", projectionError: null, duties: [duty] }, "friend");
  assert.equal(parsed.duties.length, 1);
  assert.equal(parsed.duties[0].percent, 20);
  assert.equal(parsed.duties[0].linkedOccurrences[0].work.work.id, work.id);
  assert.equal(parsed.duties[0].advancements[0].superseded, true);
  assert.equal(parsed.duties[0].goalRevision, 2);
  assert.equal(parsed.duties[0].progress[0].applied, true);
  assert.throws(() => parseFriendDuties({ schemaVersion: 1, longAgentId: "friend", projectionError: null, duties: [{ ...duty, progress: [{ ...duty.progress[0], applied: undefined }] }] }, "friend"));
  assert.throws(() => parseFriendDuties({ schemaVersion: 1, longAgentId: "other", projectionError: null, duties: [] }, "friend"));
  assert.throws(() => parseFriendDuties({ schemaVersion: 2, longAgentId: "friend", projectionError: null, duties: [] }, "friend"));
  assert.throws(() => parseFriendDuties({ schemaVersion: 1, longAgentId: "friend", projectionError: null, duties: [{ ...duty, status: "weird" }] }, "friend"));
  assert.throws(() => parseFriendDuties({ schemaVersion: 1, longAgentId: "friend", projectionError: null, duties: [{ ...duty, extra: 1 }] }, "friend"));
  assert.throws(() => parseFriendDuties({ schemaVersion: 1, longAgentId: "friend", projectionError: null, duties: [{ ...duty, id: "duty-zz" }] }, "friend"));
  assert.throws(() =>
    parseFriendDuties({ schemaVersion: 1, longAgentId: "friend", projectionError: null, duties: [{ ...duty, linkedOccurrences: [{ ...occurrence, workId: "other" }] }] }, "friend"));
});
