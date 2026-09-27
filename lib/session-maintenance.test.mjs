import assert from "node:assert/strict";
import test from "node:test";
import { parseMaintenanceOperation, parseSessionMaintenance } from "./session-maintenance.ts";
const operation = { schemaVersion: 1, sessionId: "s", requestId: "r", kind: "compact", status: "completed", result: { tokensBefore: 1000, estimatedTokensAfter: 300 } };
const snapshot = { schemaVersion: 1, projectId: "p", sessionId: "s", leafId: "leaf", capabilities: { compact: true, continue: false }, operation, event: null,
  stats: { sessionId: "s", userMessages: 2, assistantMessages: 2, toolCalls: 1, toolResults: 1, totalMessages: 5, cost: 0.02,
    tokens: { input: 100, output: 200, cacheRead: 300, cacheWrite: 400, total: 1000 }, contextUsage: { tokens: null, percent: null, contextWindow: 128000 } } };
test("native stats and unknown context usage are accepted without synthesizing zero", () => {
  assert.deepEqual(parseSessionMaintenance(snapshot, "p", "s"), snapshot);
  assert.equal(parseSessionMaintenance(snapshot, "p", "s").stats.contextUsage.tokens, null);
});
test("maintenance boundaries reject mismatched identities, non-finite counts and malformed events", () => {
  assert.throws(() => parseMaintenanceOperation(operation, "different", "r"));
  assert.throws(() => parseMaintenanceOperation(operation, "s", "different"));
  for (const value of [null, { ...snapshot, projectId: "other" }, { ...snapshot, stats: { ...snapshot.stats, cost: NaN } },
    { ...snapshot, stats: { ...snapshot.stats, contextUsage: { tokens: -1, percent: 0, contextWindow: 100 } } },
    { ...snapshot, operation: { ...operation, result: { tokensBefore: 2, estimatedTokensAfter: Infinity } } },
    { ...snapshot, event: { type: "summarization_retry_scheduled", attempt: 0 } }]) assert.throws(() => parseSessionMaintenance(value, "p", "s"));
});
