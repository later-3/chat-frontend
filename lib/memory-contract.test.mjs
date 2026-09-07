import assert from "node:assert/strict";
import test from "node:test";
import {
  fetchMemoryTargetsHealth,
  listMemoryTargets,
  memoryContractParsers,
} from "./memory-contract.ts";

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

test("memory browser combines personal and project lists before paginating", { concurrency: false }, async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  const records = {
    personal: [
      { ...memory, id: "personal-new", updatedAt: "2026-08-30T04:00:00.000Z" },
      { ...memory, id: "personal-old", updatedAt: "2026-08-30T01:00:00.000Z" },
    ],
    project: [
      { ...memory, id: "project-new", scope: "project", projectId: "chat", updatedAt: "2026-08-30T05:00:00.000Z" },
      { ...memory, id: "project-old", scope: "project", projectId: "chat", updatedAt: "2026-08-30T02:00:00.000Z" },
    ],
  };
  globalThis.fetch = async (input) => {
    const url = new URL(String(input), "http://chat.local");
    const source = url.searchParams.get("scope") === "project" ? records.project : records.personal;
    const offset = Number(url.searchParams.get("offset") ?? 0);
    const limit = Number(url.searchParams.get("limit") ?? 50);
    return Response.json({ items: source.slice(offset, offset + limit), total: source.length, limit, offset });
  };

  const page = await listMemoryTargets({
    targets: [{ type: "personal" }, { type: "project", projectId: "chat" }],
    status: "active",
    limit: 2,
    offset: 1,
  });

  assert.equal(page.total, 4);
  assert.deepEqual(page.items.map((item) => item.id), ["personal-new", "project-old"]);
});

test("memory browser aggregates health for the visible targets", { concurrency: false }, async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async (input) => {
    const url = new URL(String(input), "http://chat.local");
    return Response.json(url.searchParams.get("scope") === "project"
      ? { records: 3, indexed: 2, pending: 1, failed: 0, pendingDeletions: 1 }
      : { records: 2, indexed: 1, pending: 0, failed: 1, pendingDeletions: 0 });
  };

  assert.deepEqual(await fetchMemoryTargetsHealth([
    { type: "personal" },
    { type: "project", projectId: "chat" },
  ]), { records: 5, indexed: 3, pending: 1, failed: 1, pendingDeletions: 1 });
});
