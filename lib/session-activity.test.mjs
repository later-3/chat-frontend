import assert from "node:assert/strict";
import test from "node:test";
import { parseSessionActivity, parseSessionActivityMessages, parseDailySummary } from "./session-activity.ts";
import { findFinalAssistantIndex, turnProcessIndices, getDisplayableAssistantBlocks } from "./message-display.ts";
import { summarizeTurn } from "./turn-summary.ts";

const activity = { kind: "daily-summary", triggerEntryId: "trigger", date: "2026-09-29" };
const assistant = (text, extra = {}) => ({ role: "assistant", content: [{ type: "text", text }], ...extra });

test("maintenance provenance is validated and never inferred from text", () => {
  assert.deepEqual(parseSessionActivity(activity), activity);
  assert.equal(parseSessionActivity(undefined), undefined);
  for (const value of [null, {}, { ...activity, kind: "unknown" }, { ...activity, triggerEntryId: "" }, { ...activity, date: 1 }, { ...activity, secret: true }]) {
    assert.throws(() => parseSessionActivity(value));
  }
  assert.throws(() => parseSessionActivityMessages([{ role: "user", chatSessionActivity: activity }]));
  const ordinary = assistant('{"did":[],"reflections":[],"handoff":""}');
  assert.deepEqual(parseSessionActivityMessages([ordinary]), [ordinary]);
});

test("answer thinking precedes the memory receipt; a later daily summary is not part of that turn", () => {
  const answer = assistant("answer", { content: [{ type: "thinking", thinking: "Now respond." }, { type: "text", text: "answer" }] });
  const receipt = assistant("stored", { chatWorkflow: { stageId: "remember", agentId: "session-memory-writer" } });
  const messages = [{ role: "user", content: "hello" }, answer, receipt, assistant("summary", { chatSessionActivity: activity, usage: { input: 9000, output: 1000, cacheRead: 0, cacheWrite: 0 } })];
  assert.equal(findFinalAssistantIndex(messages, 0, messages.length), 1);
  assert.deepEqual(turnProcessIndices(messages, 0, messages.length, 1), [1, 2]);
  const total = summarizeTurn(messages, [1000, 2000, 3000, 30_000_000]);
  assert.equal(total.durationMs, 2000);
  assert.equal(total.tokens, 0, "overnight summary usage does not inflate the user's turn");
  assert.equal(getDisplayableAssistantBlocks(answer)[0].thinking, "Now respond.", "short real thinking is retained");
  const empty = assistant("", { content: [{ type: "thinking", thinking: " \n" }] });
  assert.equal(getDisplayableAssistantBlocks(empty).length, 0);
  assert.equal(getDisplayableAssistantBlocks({ ...empty, content: [{ type: "thinking", thinking: "", deferred: true }] }).length, 1);
});

test("structured summaries preserve all sections, with raw fallback on malformed or extended JSON", () => {
  const body = { did: ["completed A"], reflections: ["check B"], handoff: "continue C" };
  assert.deepEqual(parseDailySummary(JSON.stringify(body)), body);
  for (const text of ["not JSON", "{}", JSON.stringify({ ...body, did: [42] }), JSON.stringify({ ...body, unknown: "must remain visible" })]) {
    assert.equal(parseDailySummary(text), null);
  }
});
