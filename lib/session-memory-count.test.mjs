import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { countActiveSessionMemory, sessionMemoryCountKey } from "./session-memory-count.ts";

const entry = (status) => ({ status });

test("only active entries are counted", () => {
  assert.equal(countActiveSessionMemory([entry("active"), entry("superseded"), entry("active")]), 2);
  assert.equal(countActiveSessionMemory([]), 0);
});

test("the refresh key moves with the message list and the round phase", () => {
  assert.equal(sessionMemoryCountKey({ messageCount: 4, phase: "completed" }), "4:completed");
  assert.equal(sessionMemoryCountKey({ messageCount: 4, phase: null }), "4:idle");
  assert.notEqual(
    sessionMemoryCountKey({ messageCount: 4, phase: "completed" }),
    sessionMemoryCountKey({ messageCount: 6, phase: "completed" }),
    "a new message must refresh the badge",
  );
});

/**
 * The badge used to be fed by SessionMemoryPanel's `onCount`, which only runs while
 * the dialog is mounted: after a turn wrote memory the number stayed at 0 until the
 * user opened the dialog. The count must come from the memory API through the hook.
 */
test("the badge does not wait for the memory dialog to be opened", async () => {
  const window = await readFile(new URL("../components/ChatWindow.tsx", import.meta.url), "utf8");
  assert.match(window, /useSessionMemoryCount\(\{/, "the count comes from the session-memory read");
  assert.match(window, /sessionMemoryCountKey\(\{ messageCount: messages\.length, phase: activity\?\.phase \?\? null \}\)/, "a finished turn refreshes the count");
  assert.doesNotMatch(window, /const \[memoryCount, setMemoryCount\] = useState\(0\)/, "the badge must not be owned by the dialog mount");
  const hook = await readFile(new URL("../hooks/useSessionMemoryCount.ts", import.meta.url), "utf8");
  assert.match(hook, /fetchSessionMemory\(/, "the hook reads the API itself");
  assert.match(hook, /countActiveSessionMemory\(state\.entries\)/, "the hook counts active entries");
});

/**
 * The memory read target used to be `longAgentId ?? projectId`, i.e. the LA home won even when the
 * session was frozen to a bound project. The backend writes the memory beside the Pi session file in
 * the bound project, so the panel read the LA home, found nothing and showed "没有条目" (2026-10-02,
 * session 01a0fa0c in ziji-content-lab). The read target must follow the session's storage project.
 */
test("the memory read target follows the session's frozen storage project", async () => {
  const window = await readFile(new URL("../components/ChatWindow.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(window, /const memoryStorageProjectId = longAgentId \?\? projectId/,
    "the LA owner must not unconditionally win over the session's project");
  assert.match(window, /session\?\.projectId !== undefined && session\.projectId !== ownerLongAgentId/,
    "a bound project session reads its own project, not the LA home");
  assert.match(window, /\? session\.projectId\s*\n\s*: longAgentId \?\? projectId/,
    "Friend/topic sessions (projectId === LA owner) still read the LA home");
});
