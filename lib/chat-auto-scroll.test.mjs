import assert from "node:assert/strict";
import test from "node:test";
import { observeChatAutoScroll } from "./chat-auto-scroll.ts";

function createPane(t) {
  const frames = new Map();
  let nextFrame = 0;
  let resize;
  let disconnected = false;
  const globals = {
    Element: class extends EventTarget { closest() { return this.disclosure ? this : null; } },
    requestAnimationFrame(callback) { frames.set(++nextFrame, callback); return nextFrame; },
    cancelAnimationFrame(id) { frames.delete(id); },
    ResizeObserver: class {
      constructor(callback) { resize = callback; }
      observe() {}
      disconnect() { disconnected = true; }
    },
  };
  const restoreGlobals = [];
  for (const [key, value] of Object.entries(globals)) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    restoreGlobals.push(() => {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    });
  }
  const container = new class extends EventTarget {
    clientHeight = 400;
    scrollHeight = 1000;
    top = 0;
    get scrollTop() { return this.top; }
    set scrollTop(value) { this.top = Math.max(0, Math.min(value, this.scrollHeight - this.clientHeight)); }
  }();
  const content = new globals.Element();
  const follow = observeChatAutoScroll(container, content);
  t.after(() => { follow.dispose(); restoreGlobals.forEach(restore => restore()); });
  return {
    container, content, follow, frames,
    resize() { if (!disconnected) resize(); },
    scroll(top) { container.scrollTop = top; container.dispatchEvent(new Event("scroll")); },
    flush() { const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback()); },
  };
}

test("new messages, streaming tokens and tool actions follow the latest content in one frame", (t) => {
  const { container, follow, frames, flush } = createPane(t);
  follow.update("initial history"); flush();
  assert.equal(container.scrollTop, 600);
  for (const activity of ["user message", "thinking delta", "text delta", "tool start", "tool progress", "tool result", "completed"]) {
    container.scrollHeight += 300;
    follow.update(activity);
    follow.update(activity);
    assert.equal(frames.size, 1);
    flush();
    assert.equal(container.scrollTop, container.scrollHeight - container.clientHeight, activity);
  }
});

test("late Markdown/image layout and composer resizing keep the tail visible", (t) => {
  const { container, follow, resize, flush } = createPane(t);
  follow.update("reply"); flush();
  container.scrollHeight += 900;
  resize(); flush();
  assert.equal(container.scrollTop, 1500);
  container.clientHeight = 250;
  resize(); flush();
  assert.equal(container.scrollTop, 1650);
});

test("opening historical thinking, tools or a summary preserves position until new activity", (t) => {
  const { container, content, follow, resize, flush } = createPane(t);
  follow.update("completed reply"); flush();
  resize(); // Even an already queued layout follow must not defeat the user's action.
  content.disclosure = true;
  content.dispatchEvent(new Event("click"));
  container.scrollHeight += 2000;
  resize(); flush();
  assert.equal(container.scrollTop, 600, "expanding history must not jump to its last block");
  follow.update("completed reply"); resize(); flush();
  assert.equal(container.scrollTop, 600, "an unchanged poll does not steal the reading position");
  follow.update("new tool event"); flush();
  assert.equal(container.scrollTop, 2600, "new activity still follows the latest content");
});

test("collapsing the previous turn on send cannot cancel following the new turn", (t) => {
  const { container, follow, scroll, flush } = createPane(t);
  follow.update("previous turn"); flush();
  follow.update("new prompt");
  container.scrollHeight = 800;
  scroll(350); // Browser layout clamps the old scroll position before the next frame.
  flush();
  assert.equal(container.scrollTop, 400);
});

test("unchanged polling and prepending older history preserve reading position; new activity resumes follow", (t) => {
  const { container, follow, resize, scroll, flush } = createPane(t);
  follow.update(JSON.stringify({ text: "reply" })); flush();
  scroll(200);
  follow.update(JSON.stringify({ text: "reply" }));
  container.scrollHeight += 1000;
  scroll(1200); // Historical page prepend restores the previous distance from the tail.
  resize(); flush();
  assert.equal(container.scrollTop, 1200);
  follow.update("new tool action"); flush();
  assert.equal(container.scrollTop, 1600);
});

test("scrolling up cancels pending layout following and returning to the bottom restores it", (t) => {
  const { container, follow, resize, scroll, flush } = createPane(t);
  follow.update("reply"); flush();
  resize(); scroll(100); flush();
  assert.equal(container.scrollTop, 100);
  scroll(600);
  container.scrollHeight += 300;
  resize(); flush();
  assert.equal(container.scrollTop, 900);
});

test("hidden panes wait for visibility and disposed sessions cannot scroll later", (t) => {
  const { container, follow, resize, flush, frames } = createPane(t);
  container.clientHeight = 0;
  follow.update("hidden reply"); flush();
  assert.equal(container.scrollTop, 0);
  container.clientHeight = 400;
  resize(); flush();
  assert.equal(container.scrollTop, 600);
  follow.update("next reply");
  follow.dispose();
  resize(); follow.update("stale callback"); flush();
  assert.equal(frames.size, 0);
  assert.equal(container.scrollTop, 600);
});

// A one-frame top-to-bottom jump is visible even when all HTTP timings are fast.
test("initial history is positioned before paint without waiting for an animation frame", (t) => {
  const { container, follow, frames } = createPane(t);
  follow.update("cached history");
  assert.equal(container.scrollTop, 600);
  assert.equal(frames.size, 0);
});
