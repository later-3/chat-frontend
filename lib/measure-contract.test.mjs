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
 * The slider is the only writer of --conversation-measure, and it is the shared
 * Radix slider primitive rather than a hand-rolled track: dragging must track the
 * pointer live, which a custom separator implementation got wrong.
 */
test("the width slider is the only writer of the shared measure", async () => {
  const shell = await readFile(new URL("../components/AppShell.tsx", import.meta.url), "utf8");
  const slider = await readFile(new URL("../components/ui/MeasureSlider.tsx", import.meta.url), "utf8");
  const sources = await Promise.all(
    ["../components/AppShell.tsx", "../components/ui/MeasureSlider.tsx", "../hooks/useResizablePanel.ts", "../lib/conversation-measure.ts"]
      .map(path => readFile(new URL(path, import.meta.url), "utf8")),
  );
  const writers = sources.filter(source => source.includes('"--conversation-measure"'));
  assert.equal(writers.length, 1, "--conversation-measure is written in exactly one place");
  assert.match(shell, /readConversationMeasure\(\)/, "the stored preference is restored");
  assert.match(shell, /writeConversationMeasure\(/, "committed values are persisted");
  assert.match(shell, /onReset=\{\(\) => commitConversationMeasure\(null\)\}/, "reset returns to auto");
  assert.match(shell, /\{!isMobile && \([\s\S]{0,600}<MeasureSlider/, "compact does not render the slider");

  assert.match(slider, /from "@radix-ui\/react-slider"/, "the slider uses the shared Radix primitive");
  const sheets = (await readStyleSheetSources()).join("\n");
  // Hover may highlight the track, but the control must not change the pointer.
  assert.match(sheets, /\.measure-slider:hover \.measure-slider-track \{ background: var\(--bg-hover\); \}/, "hovering still highlights the track");
  const sliderRules = [...sheets.matchAll(/\.measure-slider[^\n{]*\{([^}]*)\}/g)];
  assert.ok(sliderRules.length > 0, "the slider styles exist");
  for (const rule of sliderRules) {
    assert.ok(!rule[1].includes("cursor:"), `${rule[0].split("{")[0].trim()} must not change the cursor (user rule)`);
  }
  // A manual width must beat wide content mode, otherwise the slider goes dead.
  assert.match(sheets, /\[data-workspace-chat\]\[data-conversation-measure="manual"\] \.workspace-message-column \{ max-width: var\(--conversation-measure\); \}/);
  assert.match(slider, /<Thumb className="measure-slider-thumb" \/>/, "the thumb comes from Radix");
  assert.match(slider, /onValueChange=\{\(\[next\]\) => \{ setLiveValue\(next\); onLive\(next\); \}\}/, "the live value updates while dragging");
  assert.match(slider, /onValueCommit=\{\(\[next\]\) => \{ setDragging\(false\); onCommit\(next\); \}\}/, "only the released value is persisted");
  for (const forbidden of ["setPointerCapture", "addEventListener", "localStorage", "clientX"]) {
    assert.ok(!slider.includes(forbidden), `MeasureSlider must not implement ${forbidden} itself`);
  }
});
