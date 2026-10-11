import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { readStyleSheetSources } from "./style-sources.ts";

const appShellSource = await readFile(new URL("../components/AppShell.tsx", import.meta.url), "utf8");
const dialogSource = await readFile(new URL("../components/FullHistoryDialog.tsx", import.meta.url), "utf8");
const surfaceSource = await readFile(new URL("../components/SurfaceDialog.tsx", import.meta.url), "utf8");
const styles = (await readStyleSheetSources()).join("\n");

test("full history opens inside Chat instead of creating a browser tab", () => {
  assert.match(appShellSource, /setFullHistorySessionId\(selectedSession\.id\)/);
  assert.doesNotMatch(appShellSource, /window\.open\([\s\S]*?\/export\?inline=1/);
  assert.match(surfaceSource, /@radix-ui\/react-dialog/);
  assert.match(surfaceSource, /<Dialog.Content/);
  // B3 · U7 合同变更（B3-design §2.C，G1 通过）：按轮列表 + 原位展开；Pi 导出降为下载，
  // 整份导出不再 iframe/srcDoc 载入（基线 2.1MB 出首屏）。
  assert.doesNotMatch(dialogSource, /<iframe/);
  assert.doesNotMatch(dialogSource, /srcDoc/);
  assert.match(dialogSource, /download>/);
  assert.match(dialogSource, /\/export\?projectId=/);
  assert.match(dialogSource, /data-full-history-turns/);
  assert.match(dialogSource, /TurnInteractions/);
});

test("full history uses the shared dialog size and mobile layout", () => {
  // No tier of its own: the history reader is the same floating page as session
  // memory (UI/UX §20.6), and compact turns every dialog full screen.
  assert.doesNotMatch(styles, /\.surface-dialog-wide/, "history must not pick a different size");
  assert.match(styles, /\.surface-dialog \{[^}]*width:min\(1120px/);
  assert.match(styles, /\.surface-dialog \{[^}]*width:100%; height:100dvh/);
  assert.match(styles, /surface-header[^}]*env\(safe-area-inset-top\)/);
});
