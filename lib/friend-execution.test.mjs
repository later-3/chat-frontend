import assert from "node:assert/strict";
import test from "node:test";
import { followFriendExecution, parseFriendExecution, FriendContractError } from "./friend-execution.ts";
const ref = {
  schemaVersion: 1,
  kind: "friend",
  id: "turn",
  longAgentId: "friend",
  projectId: "friend",
  sessionId: "session",
  contextProjectId: "a",
  status: "running",
  error: null,
  acceptedAt: "2026-09-19T00:00:00Z",
  capabilities: { cancel: true, steer: true, followUp: true, images: false },
};
const snapshot = { seq: 0, messages: [], partial: null, phase: { type: "agent_start" } };
const envelope = (seq, text) => ({
  schemaVersion: 1,
  type: "agent_event",
  execution: { kind: "friend", id: "turn", sessionId: "session", projectId: "friend" },
  seq,
  at: "2026-09-19T00:00:00Z",
  event: { type: "message_update", assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: text } },
});
const stream = (values) => new Response(values.map((v) => JSON.stringify(v) + "\n").join(""));
test("Friend uses shared event consumer, ignores duplicates, replaces missing history on reconnect, and never reposts", async (t) => {
  const prior = globalThis.fetch;
  t.after(() => (globalThis.fetch = prior));
  let gets = 0;
  const methods = [];
  const deltas = [],
    snapshots = [];
  globalThis.fetch = async (url, init) => {
    methods.push(init?.method ?? "GET");
    if (String(url).includes("/events"))
      return ++gets === 1
        ? stream([envelope(1, "A"), envelope(1, "A"), envelope(3, "missing")])
        : stream([envelope(4, "D"), { type: "status", execution: { ...ref, status: "completed" } }]);
    return Response.json({
      execution: ref,
      snapshot: gets
        ? { ...snapshot, seq: 3, messages: [{ role: "assistant", content: [{ type: "text", text: "ABC" }] }] }
        : snapshot,
    });
  };
  const result = await followFriendExecution(ref, new AbortController().signal, {
    event: (e) => deltas.push(e.event.assistantMessageEvent.delta),
    snapshot: (s) => snapshots.push(s),
    status: () => {},
    connection: () => {},
  });
  assert.equal(result.status, "completed");
  assert.deepEqual(deltas, ["A", "D"]);
  assert.equal(snapshots.length, 2);
  assert.equal(snapshots[1].seq, 3);
  assert.ok(methods.every((m) => m === "GET"));
});
test("Friend rejects unknown version/identity, preserves failed versus cancelled, and does not fake completion on disconnect", async (t) => {
  assert.throws(() => parseFriendExecution({ ...ref, schemaVersion: 2 }), FriendContractError);
  const prior = globalThis.fetch;
  t.after(() => (globalThis.fetch = prior));
  globalThis.fetch = async () => Response.json({ execution: { ...ref, id: "someone-else" }, snapshot });
  await assert.rejects(
    followFriendExecution(ref, new AbortController().signal, {
      event: () => {},
      snapshot: () => {},
      status: () => {},
      connection: () => {},
    }),
    /归属不一致/,
  );
  for (const status of ["failed", "cancelled", "interrupted"]) {
    globalThis.fetch = async () => Response.json({ execution: { ...ref, status, error: "original reason" }, snapshot });
    await assert.rejects(
      followFriendExecution(ref, new AbortController().signal, {
        event: () => {},
        snapshot: () => {},
        status: () => {},
        connection: () => {},
      }),
      (e) => e.message === "original reason" && e.status === (status === "cancelled" ? "cancelled" : "failed"),
    );
  }
});

test("silent stream timeout releases the reader, while observer abort is not a model cancellation", async () => {
  const { consumeExecutionStream } = await import("./execution-stream.ts");
  let detached = 0;
  const response = () =>
    new Response(
      new ReadableStream({
        cancel() {
          detached++;
        },
      }),
    );
  await assert.rejects(
    consumeExecutionStream(response(), new AbortController().signal, () => {}, 20),
    /超时/,
  );
  const controller = new AbortController();
  const reading = consumeExecutionStream(response(), controller.signal, () => {});
  controller.abort();
  await assert.rejects(reading, { name: "AbortError" });
  assert.equal(detached, 2);
});

test("a compacted native conversation can resume through the same snapshot contract", async (t) => {
  const prior = globalThis.fetch;
  t.after(() => (globalThis.fetch = prior));
  const messages = [
    { role: "custom", customType: "compaction", content: "Earlier project context", display: true, details: { tokensBefore: 10000 } },
    { role: "custom", customType: "branch-summary", content: "Earlier branch", display: true },
    { role: "bashExecution", command: "pwd", output: "/project" },
    { role: "user", content: "Continue after compaction" },
  ];
  globalThis.fetch = async () => Response.json({ execution: { ...ref, status: "completed" }, snapshot: { ...snapshot, messages } });
  let recovered;
  await followFriendExecution(ref, new AbortController().signal, {
    event: () => {}, snapshot: (value) => { recovered = value; }, status: () => {}, connection: () => {},
  });
  assert.deepEqual(recovered.messages, messages);
  globalThis.fetch = async () => Response.json({ execution: ref, snapshot: { ...snapshot, messages: [{ role: "unknown" }] } });
  await assert.rejects(followFriendExecution(ref, new AbortController().signal, {
    event: () => {}, snapshot: () => {}, status: () => {}, connection: () => {},
  }), FriendContractError);
});
