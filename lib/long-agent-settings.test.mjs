import assert from "node:assert/strict";
import test from "node:test";
import {
  formatLongAgentInstructions,
  formatAgentMemoryPreview,
  LONG_AGENT_INSTRUCTION_SEPARATOR,
  parseLongAgentInstructions,
} from "./long-agent-settings.ts";

test("Long Agent instruction editing preserves multi-line instruction boundaries", () => {
  const instructions = [
    "第一段说明\n包含第二行\n和第三行",
    "另一段独立说明\n仍然可以换行",
  ];
  const editable = formatLongAgentInstructions(instructions);
  assert.match(editable, new RegExp(LONG_AGENT_INSTRUCTION_SEPARATOR));
  assert.deepEqual(parseLongAgentInstructions(editable), instructions);
  assert.deepEqual(parseLongAgentInstructions("一条指令\n内部换行"), ["一条指令\n内部换行"]);
});

test("Agent Memory summary preview never renders the full large core file", () => {
  const large = `# Core\n${"x".repeat(10_000)}`;
  const preview = formatAgentMemoryPreview(large);
  assert.equal(preview.endsWith("…"), true);
  assert.equal(preview.length, 2_001);
  assert.equal(formatAgentMemoryPreview("  # Small  "), "# Small");
});
