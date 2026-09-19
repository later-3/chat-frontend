import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fetchLongAgentFeed } from "./long-agents-browser.ts";
import { enLocale } from "./i18n/messages/en.ts";
import { zhCNLocale } from "./i18n/messages/zh-CN.ts";

const comment = { id: "c1", longAgentId: "muse", text: "一起讨论", createdAt: "2026-09-12T08:40:00Z" };
const post = { id: "p1", longAgentId: "nexus", date: "2026-09-12", text: "今天的发现\n第二行", createdAt: "2026-09-12T08:30:00Z", comments: [comment] };

test("feed reads real text and comments through the existing all-coworker API", async (t) => {
  const controller = new AbortController();
  t.mock.method(globalThis, "fetch", async (url, init) => {
    assert.equal(url, "/api/long-agents/agent%20one/social?limit=30");
    assert.equal(init.signal, controller.signal);
    assert.equal(init.cache, "no-store");
    return Response.json({ schemaVersion: 1, posts: [{ ...post, sourceSummaryDate: null }] });
  });
  assert.deepEqual(await fetchLongAgentFeed("agent one", { limit: 30 }, controller.signal), [post]);
});

test("malformed timestamps, comments and duplicate identities fail at the feed boundary", async (t) => {
  const invalid = [
    [{ ...post, createdAt: "bad date" }], [{ ...post, text: null }], [{ ...post, longAgentId: "" }],
    [{ ...post, comments: null }], [{ ...post, comments: [{ ...comment, text: 123 }] }],
    [{ ...post, comments: [{ ...comment, createdAt: "invalid" }] }],
    [{ ...post, comments: [comment, comment] }], [post, post], [null],
  ];
  let posts = [];
  t.mock.method(globalThis, "fetch", async () => Response.json({ schemaVersion: 1, posts }));
  assert.deepEqual(await fetchLongAgentFeed("nexus"), []);
  for (const value of invalid) {
    posts = value;
    await assert.rejects(fetchLongAgentFeed("nexus"), /无效的朋友圈/);
  }
});

test("a failed feed request remains a recoverable error instead of an empty feed", async (t) => {
  t.mock.method(globalThis, "fetch", async () => Response.json({ message: "暂时不可用" }, { status: 503 }));
  await assert.rejects(fetchLongAgentFeed("nexus"), /暂时不可用/);
});

test("every Moments label is translated in both supported languages", async () => {
  const source = await readFile(new URL("../components/LongAgentFeedView.tsx", import.meta.url), "utf8");
  const keys = [...source.matchAll(/"((?:social|common|longAgentSettings)\.[\w]+)"/g)].map((match) => match[1]);
  for (const locale of [enLocale, zhCNLocale]) {
    for (const key of keys) assert.ok(locale.messages[key]?.trim(), `${locale.id} is missing ${key}`);
  }
});

test("Moments uses a global main page and keeps the chat mounted", async () => {
  const source = await readFile(new URL("../components/LongAgentFeedView.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../components/LongAgentFeedView.module.css", import.meta.url), "utf8");
  const app = await readFile(new URL("../components/AppShell.tsx", import.meta.url), "utf8");
  const sidebar = await readFile(new URL("../components/SessionSidebar.tsx", import.meta.url), "utf8");
  const coworkers = await readFile(new URL("../components/ProjectLongAgentSection.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /<dialog|showModal|createPortal/);
  assert.doesNotMatch(coworkers, /LongAgentFeedView|feedOpen|socialHeading/);
  assert.match(app, /data-workspace-chat hidden=\{settingsVisible \|\| workspaceView !== "chat"\}/);
  assert.match(app, /enabled: !settingsVisible && workspaceView === "chat"/);
  assert.match(app, /<WorkspaceNavigation/);
  assert.match(sidebar, /createPortal/);
  assert.match(css, /\(max-width: 768px\), \(hover: none\) and \(pointer: coarse\) and \(max-height: 500px\)/);
  for (const edge of ["top", "right", "bottom", "left"]) assert.ok(css.includes(`var(--safe-area-${edge})`));
});
