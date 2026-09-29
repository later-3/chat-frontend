import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { readStyleSheetSources } from "./style-sources.ts";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

/**
 * A SurfaceDialog body must own its scrolling (UI/UX §18.4, §20.4).
 *
 * `.surface-dialog` is a flex column with `overflow: hidden`; a flex child without
 * `min-height: 0` cannot shrink below its content, so tall bodies were clipped with
 * no scrollbar. The session-memory dialog was the visible case: it also skipped the
 * shared body classes entirely.
 */
test("dialog bodies can scroll", async () => {
  const sheets = (await readStyleSheetSources()).join("\n");
  for (const className of ["ui-scroll-20", "ui-list-scroll"]) {
    const rule = sheets.match(new RegExp(`\\.${className} \\{([^}]*)\\}`));
    assert.ok(rule, `.${className} exists`);
    assert.match(rule[1], /min-height: 0/, `.${className} must be allowed to shrink`);
    assert.match(rule[1], /overflow-y: auto/, `.${className} owns the scroll`);
  }
});

test("the session-memory reader is one shared dialog with a scrolling body", async () => {
  const dialog = await read("../components/SessionMemoryDialog.tsx");
  assert.match(dialog, /<SurfaceDialog title=\{t\("topics\.memoryPanel"\)\}/, "the shared modal shell owns the reader");
  assert.match(dialog, /className="ui-scroll-20 ui-stack-16"/, "the body uses the shared scroll owner");
  assert.match(dialog, /data-session-memory-toggle/, "the record toggle stays inside the dialog");

  const panel = await read("../components/SessionMemoryPanel.tsx");
  assert.doesNotMatch(panel, /\.module\.css/, "the reader uses shared classes, not its own stylesheet");
  assert.doesNotMatch(panel, /<button/, "buttons come from the Button primitive");
  assert.doesNotMatch(panel, /maxWidth|overflow-y/, "the reader does not hand-roll its own geometry");

  const window = await read("../components/ChatWindow.tsx");
  assert.match(window, /<SessionMemoryDialog/, "ChatWindow renders the reader instead of assembling it");
  assert.doesNotMatch(window, /session-memory-setting/, "the one-off setting row class is gone");
});
