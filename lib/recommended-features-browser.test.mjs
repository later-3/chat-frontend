import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("tool results keep image blocks and render them lazily when expanded", async () => {
  const source = await readFile(new URL("../components/MessageView.tsx", import.meta.url), "utf8");
  assert.match(source, /getMessageImages\(result\?\.content \?\? \[\]\)/);
  assert.match(source, /<PairedResult[\s\S]*images=\{resultImages\}/);
  assert.match(source, /<img[\s\S]*loading="lazy"/);
});

test("the explorer search toggle is wired to the bounded backend file index", async () => {
  const [sidebar, explorer] = await Promise.all([
    readFile(new URL("../components/SessionSidebar.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/FileExplorer.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(sidebar, /fileSearchOpen=\{fileSearchOpen\}/);
  assert.match(sidebar, /onFileSearchOpenChange=\{setFileSearchOpen\}/);
  assert.match(explorer, /\/api\/file-index\?cwd=/);
  assert.match(explorer, /buildSearchTree\(searchPaths\)/);
});
