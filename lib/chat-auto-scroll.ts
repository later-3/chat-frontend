import { getLiveFollowAttached } from "./chat-lazy-load.ts";

/** Follow incoming activity and delayed layout changes within the message pane. */
export function observeChatAutoScroll(container: HTMLElement, content: HTMLElement) {
  let activityKey: string | undefined;
  let attached = true;
  let activityPending = false;
  let previousTop = container.scrollTop;
  let frame: number | null = null;
  let disposed = false;

  const schedule = () => {
    if (disposed || !attached || frame !== null) return;
    frame = requestAnimationFrame(() => {
      frame = null;
      activityPending = false;
      if (disposed || !attached || container.clientHeight === 0) return;
      // Instant positioning avoids overlapping smooth animations during streaming.
      container.scrollTop = container.scrollHeight;
      previousTop = container.scrollTop;
    });
  };
  const onScroll = () => {
    // New turns can collapse old tool groups and clamp scrollTop before the
    // scheduled follow. That layout scroll must not cancel incoming activity.
    if (activityPending) return;
    attached = getLiveFollowAttached(
      attached, previousTop, container.scrollTop, container.clientHeight, container.scrollHeight,
    );
    previousTop = container.scrollTop;
  };
  container.addEventListener("scroll", onScroll, { passive: true });
  const observer = new ResizeObserver(schedule);
  observer.observe(container);
  observer.observe(content);

  return {
    update(nextActivityKey: string) {
      if (disposed || nextActivityKey === activityKey) return;
      activityKey = nextActivityKey;
      // A new message, token or tool action resumes following. An unchanged poll
      // or loading older history leaves the user's reading position untouched.
      attached = true;
      activityPending = true;
      schedule();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      observer.disconnect();
      container.removeEventListener("scroll", onScroll);
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
    },
  };
}
