import assert from "node:assert/strict";
import test from "node:test";
import { memoryContractParsers } from "./memory-contract.ts";

const memory = {
  id: "memory-1",
  text: "Later偏好简洁的Agent架构。",
  kind: "preference",
  scope: "personal",
  projectId: null,
  groupId: "memory-1",
  metadata: {},
  sourceSessionId: null,
  sourceProjectId: null,
  sourceEntryIds: [],
  sourceWorkflowInvocationId: null,
  status: "active",
  version: 1,
  mem0Id: "mem0-1",
  indexStatus: "indexed",
  indexError: null,
  createdAt: "2026-08-30T00:00:00.000Z",
  updatedAt: "2026-08-30T00:00:00.000Z",
};

test("memory browser contract validates list, search, health, and rebuild payloads", () => {
  assert.equal(memoryContractParsers.list({ items: [memory], total: 1, limit: 50, offset: 0 }).items[0].id, "memory-1");
  assert.equal(memoryContractParsers.search({ results: [{ memory, score: 0.9 }] })[0].score, 0.9);
  assert.deepEqual(memoryContractParsers.health({ records: 1, indexed: 1, pending: 0, failed: 0, pendingDeletions: 0 }), {
    records: 1,
    indexed: 1,
    pending: 0,
    failed: 0,
    pendingDeletions: 0,
  });
  assert.equal(memoryContractParsers.rebuild({ total: 1, indexed: 1, failed: 0, failures: [] }).failed, 0);
});

test("memory browser contract rejects malformed server data", () => {
  assert.throws(
    () => memoryContractParsers.list({ items: [{ ...memory, version: "1" }], total: 1, limit: 50, offset: 0 }),
    /version/,
  );
  assert.throws(() => memoryContractParsers.search({ results: [{ memory: null, score: 1 }] }), /Memory记录/);
  assert.throws(() => memoryContractParsers.health({ records: 1 }), /indexed/);
});
