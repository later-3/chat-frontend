import assert from "node:assert/strict";
import test from "node:test";
import { parseSessionForkResult, forkSession } from "./session-fork-browser.ts";

test("Fork accepts only the requested Project and parent and preserves the selected draft", async (t) => {
  const result = { schemaVersion: 1, projectId: "p", parentSessionId: "parent", sessionId: "child", selectedText: "edit this" };
  assert.deepEqual(parseSessionForkResult(result, "p", "parent"), result);
  for (const invalid of [{ ...result, projectId: "other" }, { ...result, sessionId: "parent" }, { ...result, selectedText: null }]) assert.throws(() => parseSessionForkResult(invalid, "p", "parent"));
  const previous = globalThis.fetch;
  t.after(() => { globalThis.fetch = previous; });
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "/api/sessions/parent/fork");
    assert.deepEqual(JSON.parse(options.body), { projectId: "p", entryId: "entry", requestId: "request" });
    return Response.json(result);
  };
  assert.deepEqual(await forkSession("p", "parent", "entry", "request"), result);
});
