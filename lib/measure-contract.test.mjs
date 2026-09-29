import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { readStyleSheetSources } from "./style-sources.ts";

/**
 * Messages, run status and the composer are one column: same --measure-prose,
 * same centre, same 36px ChatMinimap gutter. The composer kept a hardcoded
 * 880px after the message column moved to --measure-prose (42rem), so on wide
 * screens the messages were 672px wide while the input box was 880px wide and
 * centred 18px further right (UI/UX §7 阅读面, §v2.3 art direction).
 */
test("the conversation column and the composer share one measure", async () => {
  const sheets = (await readStyleSheetSources()).join("\n");
  assert.match(sheets, /--measure-prose:\s*42rem;/, "the prose measure token exists");
  assert.match(sheets, /\.workspace-message-column \{ max-width: var\(--measure-prose/, "messages use the token");
  assert.match(sheets, /\.workspace-composer-column \{[^}]*max-width: calc\(var\(--measure-prose[^}]*--composer-gutter/, "the composer uses the token plus the minimap gutter");
  assert.match(sheets, /\.workspace-wide-content \.workspace-composer-column \{ max-width: 100%/, "wide mode expands the composer with the messages");
  assert.match(sheets, /@media \(max-width:768px\)[\s\S]{0,400}\.workspace-composer-column \{ --composer-gutter: 0px;/, "compact drops the minimap gutter");

  const input = await readFile(new URL("../components/ChatInput.tsx", import.meta.url), "utf8");
  assert.match(input, /isMobile \? "mobile-textarea mobile-composer" : "workspace-composer-column"/, "the composer root carries the shared class");
  const status = await readFile(new URL("../components/RunStatus.tsx", import.meta.url), "utf8");
  assert.match(status, /className="workspace-composer-column"/, "run status shares the same column");
  for (const [name, body] of [["ChatInput", input], ["RunStatus", status]]) {
    const hardcoded = [...body.matchAll(/maxWidth:\s*(\d{3,})/g)].map(match => match[1]);
    assert.deepEqual(hardcoded, [], `${name} must not hardcode a pixel measure (${hardcoded.join(", ")})`);
  }
});
