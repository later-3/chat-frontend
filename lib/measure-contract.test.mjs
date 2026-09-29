import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { readStyleSheetSources } from "./style-sources.ts";

const MEASURE = "var\\(--conversation-measure, var\\(--measure-prose";

/**
 * Messages, run status and the composer are one column: same measure, same
 * centre, and the 36px ChatMinimap gutter. The composer kept a hardcoded 880px
 * after the message column moved to --measure-prose (42rem), so on wide screens
 * the messages were 672px wide while the input box was 880px wide and centred
 * 18px further right (UI/UX §7 阅读面, §20.7 会话宽度).
 */
test("the conversation column reads one shared measure", async () => {
  const sheets = (await readStyleSheetSources()).join("\n");
  assert.match(sheets, /--measure-prose:\s*42rem;/, "the layout default token exists");
  assert.match(sheets, new RegExp(`\\.workspace-message-column \\{ max-width: ${MEASURE}`), "messages read the shared measure");
  assert.match(sheets, new RegExp(`\\.workspace-composer-column \\{[^}]*max-width: calc\\(${MEASURE}[^}]*--composer-gutter`), "the composer reads the same measure plus the minimap gutter");
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

/**
 * The slider is the only writer of --conversation-measure, and it owns no drag
 * implementation of its own; the value, range and storage come from
 * lib/conversation-measure.ts and the shared useResizablePanel hook.
 */
test("the width slider is the only writer of the shared measure", async () => {
  const shell = await readFile(new URL("../components/AppShell.tsx", import.meta.url), "utf8");
  const slider = await readFile(new URL("../components/ui/MeasureSlider.tsx", import.meta.url), "utf8");
  const sources = await Promise.all(
    ["../components/AppShell.tsx", "../components/ui/MeasureSlider.tsx", "../hooks/useResizablePanel.ts", "../lib/conversation-measure.ts"]
      .map(path => readFile(new URL(path, import.meta.url), "utf8")),
  );
  const writers = sources.filter(source => source.includes('"--conversation-measure"'));
  assert.equal(writers.length, 1, "--conversation-measure is declared in exactly one place");
  assert.match(shell, /autoSentinel: CONVERSATION_MEASURE_AUTO_SENTINEL/, "the slider keeps an explicit auto preference");
  assert.match(shell, /\.\.\.conversationMeasureResizer\.separatorProps/, "the slider reuses the shared resize primitive");
  assert.match(shell, /\{!isMobile && \([\s\S]{0,600}<MeasureSlider/, "compact does not render the slider");
  for (const forbidden of ["addEventListener", "onPointerDown", "setPointerCapture", "localStorage"]) {
    assert.ok(!slider.includes(forbidden), `MeasureSlider must not implement ${forbidden} itself`);
  }
});
