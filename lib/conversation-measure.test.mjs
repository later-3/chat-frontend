import assert from "node:assert/strict";
import test from "node:test";
import {
  CONVERSATION_MEASURE_AUTO_SENTINEL,
  CONVERSATION_MEASURE_DEFAULT_WIDTH,
  CONVERSATION_MEASURE_MAX_WIDTH,
  CONVERSATION_MEASURE_MIN_WIDTH,
  CONVERSATION_MEASURE_STEP,
  CONVERSATION_MEASURE_STORAGE_KEY,
  clampConversationMeasure,
  conversationMeasureCssValue,
  formatConversationMeasure,
  readConversationMeasure,
  stepConversationMeasure,
  writeConversationMeasure,
} from "./conversation-measure.ts";

const storage = new Map();
globalThis.window = {
  localStorage: {
    getItem: (key) => (storage.has(key) ? storage.get(key) : null),
    removeItem: (key) => storage.delete(key),
    setItem: (key, value) => storage.set(key, String(value)),
  },
};

test("the slider stays inside the readable range", () => {
  assert.equal(clampConversationMeasure(100), CONVERSATION_MEASURE_MIN_WIDTH);
  assert.equal(clampConversationMeasure(10_000), CONVERSATION_MEASURE_MAX_WIDTH);
  assert.equal(clampConversationMeasure(Number.NaN), CONVERSATION_MEASURE_DEFAULT_WIDTH);
  assert.equal(stepConversationMeasure(CONVERSATION_MEASURE_DEFAULT_WIDTH, CONVERSATION_MEASURE_STEP), 684);
  assert.equal(stepConversationMeasure(CONVERSATION_MEASURE_DEFAULT_WIDTH, -CONVERSATION_MEASURE_STEP), 660);
  assert.equal(stepConversationMeasure(CONVERSATION_MEASURE_MAX_WIDTH, CONVERSATION_MEASURE_STEP), CONVERSATION_MEASURE_MAX_WIDTH);
  assert.equal(stepConversationMeasure(CONVERSATION_MEASURE_MIN_WIDTH, -CONVERSATION_MEASURE_STEP), CONVERSATION_MEASURE_MIN_WIDTH);
});

test("auto is a stored sentinel and removes the CSS override", () => {
  writeConversationMeasure(null);
  assert.equal(storage.get(CONVERSATION_MEASURE_STORAGE_KEY), CONVERSATION_MEASURE_AUTO_SENTINEL);
  assert.equal(readConversationMeasure(), null);
  assert.equal(conversationMeasureCssValue(null), "", "auto falls back to --measure-prose");
  writeConversationMeasure(720);
  assert.equal(readConversationMeasure(), 720);
  assert.equal(conversationMeasureCssValue(720), "720px");
});

test("stored values are clamped and unreadable values fall back to auto", () => {
  storage.set(CONVERSATION_MEASURE_STORAGE_KEY, "100");
  assert.equal(readConversationMeasure(), CONVERSATION_MEASURE_MIN_WIDTH);
  storage.set(CONVERSATION_MEASURE_STORAGE_KEY, "wide please");
  assert.equal(readConversationMeasure(), null);
  storage.delete(CONVERSATION_MEASURE_STORAGE_KEY);
  assert.equal(readConversationMeasure(), null);
});

test("the readout uses the design unit", () => {
  assert.equal(formatConversationMeasure(CONVERSATION_MEASURE_DEFAULT_WIDTH), "42rem");
  assert.equal(formatConversationMeasure(768), "48rem");
  assert.equal(formatConversationMeasure(10_000), "60rem");
});
