import assert from "node:assert/strict";
import test from "node:test";
import { resumeChatWorkflowRun, cancelChatWorkflowRun, WorkflowTerminalError } from "./chat-workflow-browser.ts";
const reference = { runId: "run", projectId: "project", workflowInvocationId: "invocation" };
const completed = { status: "completed", runId: "run", result: { text: "done", sessionId: "session", sessionFile: "session.jsonl", model: null } };

test("completed Runtime status finishes even if the event stream never closes", async t => {
  let cancelled = false;
  t.mock.method(globalThis, "fetch", async url => String(url).includes("/events")
    ? new Response(new ReadableStream({ cancel() { cancelled = true; } }))
    : Response.json(completed));
  const result = await resumeChatWorkflowRun(reference, undefined, () => {});
  assert.equal(result.result.text, "done");
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(cancelled, true);
});

test("failure and cancellation finish without waiting for stream data", async t => {
  let status = "failed";
  t.mock.method(globalThis, "fetch", async url => String(url).includes("/events")
    ? new Response(new ReadableStream()) : Response.json({ status, error: "interrupted" }));
  await assert.rejects(resumeChatWorkflowRun(reference, undefined, () => {}), error => error instanceof WorkflowTerminalError && error.status === "failed");
  status = "cancelled";
  await assert.rejects(resumeChatWorkflowRun(reference, undefined, () => {}), error => error.status === "cancelled");
});

test("lost event connection is reported while authoritative status can still complete", async t => {
  const updates = [];
  t.mock.method(globalThis, "fetch", async url => {
    if (String(url).includes("/events")) throw new TypeError("network lost");
    await new Promise(resolve => setTimeout(resolve, 10));
    return Response.json(completed);
  });
  await resumeChatWorkflowRun(reference, undefined, () => {}, value => updates.push(value.kind));
  assert.deepEqual(updates, ["stream_lost", "confirmed"]);
});

test("network failure is not classified as execution failure; no prompt is reposted", async t => {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, init) => {
    calls.push(init?.method ?? "GET");
    if (String(url).includes("/events")) return new Response(new ReadableStream());
    throw new TypeError("offline");
  });
  await assert.rejects(resumeChatWorkflowRun(reference, undefined, () => {}), error => !(error instanceof WorkflowTerminalError));
  assert.ok(calls.every(method => method === "GET"));
});

test("stop requires a real cancellation acknowledgement", async t => {
  let body = { status: "running" };
  t.mock.method(globalThis, "fetch", async (_url, init) => {
    assert.equal(init.method, "DELETE");
    assert.ok(init.signal instanceof AbortSignal);
    return Response.json(body);
  });
  await assert.rejects(cancelChatWorkflowRun(reference), /停止确认/);
  body = { status: "cancelled" };
  await cancelChatWorkflowRun(reference);
});
