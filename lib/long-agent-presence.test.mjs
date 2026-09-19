import assert from "node:assert/strict";
import test from "node:test";
import { parseLongAgentPresence } from "./long-agent-presence.ts";

test("presence contracts preserve independent coworkers and reject invented or ambiguous state", () => {
  const snapshot = { schemaVersion: 1, observedAt: "2026-09-19T00:00:00Z", agents: [{ id: "nexus", status: "working" }, { id: "mira", status: "ready" }] };
  assert.deepEqual(parseLongAgentPresence(snapshot), snapshot);
  for (const invalid of [null, { ...snapshot, schemaVersion: 2 }, { ...snapshot, observedAt: "yesterday" },
    { ...snapshot, agents: [{ id: "nexus", status: "away" }] }, { ...snapshot, agents: [snapshot.agents[0], snapshot.agents[0]] }]) {
    assert.throws(() => parseLongAgentPresence(invalid));
  }
});
