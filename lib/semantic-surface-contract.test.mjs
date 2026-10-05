import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

/**
 * Semantic surface contract (UI/UX §4.1, §18.4, §20.4).
 *
 * A page must not invent its own colour: state tints come from the named tokens in tokens.css,
 * which are derived once from the palette roles so every palette and both modes inherit them.
 * This gate covers the two surfaces a user reads and writes on every round — the composer and
 * the message body — because that is exactly where hand-rolled rgba() tints used to drift.
 */
const read = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

const GUARDED = ["components/ChatInput.tsx", "components/MessageView.tsx"];

test("composer and message surfaces use named tokens instead of hand-rolled colour", async () => {
  for (const file of GUARDED) {
    const body = await read(file);
    assert.doesNotMatch(body, /rgba\(\s*\d/, `${file} must not hard-code rgba() tints`);
    assert.doesNotMatch(body, /#[0-9a-fA-F]{6}\b/, `${file} must not hard-code hex colours`);
  }
});

test("the derived semantic tokens exist and cover the states these surfaces express", async () => {
  const tokens = await read("src/styles/tokens.css");
  for (const token of [
    "--success-wash", "--success-outline",
    "--warning-wash", "--warning-outline",
    "--danger-wash", "--danger-outline",
    "--diff-add-wash", "--diff-remove-wash", "--diff-hunk-wash",
    "--media-outline", "--shadow-composer",
  ]) {
    assert.ok(tokens.includes(`${token}:`), `${token} must be defined in tokens.css`);
  }
  // Defined once from palette roles, so palettes and dark mode inherit them instead of re-declaring.
  assert.match(tokens, /--success-wash:\s*color-mix\(in srgb, var\(--success\)/, "derived, not duplicated per palette");
  assert.match(tokens, /--danger-outline:\s*color-mix\(in srgb, var\(--danger\)/, "derived, not duplicated per palette");
});

test("shared surface classes back the tokens, so pages do not re-implement the look", async () => {
  const styles = await read("src/styles/components.css");
  for (const selector of [
    ".ui-note-inline",
    ".ui-note-inline.is-warning",
    ".ui-note-inline.is-success",
    ".ui-note-inline.is-danger",
    ".message-tool-card",
    ".message-tool-card.is-success",
    ".message-tool-card.is-error",
    ".message-diff-add",
    ".message-diff-remove",
    ".composer-queue-action",
  ]) {
    assert.ok(styles.includes(`${selector} `) || styles.includes(`${selector},`) || styles.includes(`${selector}{`) || styles.includes(`${selector} {`),
      `${selector} must exist in components.css`);
  }
  assert.doesNotMatch(styles.match(/\.ui-note-inline[\s\S]*?\n\n/)?.[0] ?? "", /rgba\(\s*\d/, "the note family must not hard-code colour");
});

test("the tool card expresses its state through one class and a testable attribute", async () => {
  const body = await read("components/MessageView.tsx");
  assert.match(body, /className=\{`message-tool-card/, "the card state is a class, not inline colours");
  assert.match(body, /data-tool-card-state=\{isError \? "error" : result !== undefined \? "success" : "pending"\}/,
    "pending / success / error stay distinguishable for review and browser gates");
});
