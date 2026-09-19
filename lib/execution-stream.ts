/** Shared transport for Workflow and Friend. A closed connection is not an execution result. */
export async function consumeExecutionStream(
  response: Response,
  signal: AbortSignal,
  onValue: (value: unknown) => void,
  idleTimeoutMs = 0,
): Promise<void> {
  if (!response.ok || !response.body) throw new Error(`过程连接失败：HTTP ${response.status}`);
  const reader = response.body.getReader(),
    decoder = new TextDecoder();
  let buffered = "";
  const cancel = () => {
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener("abort", cancel, { once: true });
  if (signal.aborted) cancel();
  try {
    for (;;) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      let timedOut = false;
      if (idleTimeoutMs > 0)
        timer = setTimeout(() => {
          timedOut = true;
          cancel();
        }, idleTimeoutMs);
      const result = await reader.read().finally(() => clearTimeout(timer));
      if (timedOut) throw new Error("过程连接超时，正在重新同步");
      const { done, value } = result;
      if (signal.aborted) throw new DOMException("已停止观察", "AbortError");
      buffered += decoder.decode(value, { stream: !done });
      let newline;
      while ((newline = buffered.indexOf("\n")) !== -1) {
        const line = buffered.slice(0, newline).trim();
        buffered = buffered.slice(newline + 1);
        if (line) onValue(JSON.parse(line) as unknown);
      }
      if (done) break;
    }
    if (buffered.trim()) onValue(JSON.parse(buffered) as unknown);
  } finally {
    signal.removeEventListener("abort", cancel);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
