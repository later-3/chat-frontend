import { useEffect, useState } from "react";
import { readLongAgentMemory, type LongAgentMemoryRead } from "@/lib/long-agent-group-browser";
import { useI18n } from "@/hooks/useI18n";
import { SurfaceDialog } from "./SurfaceDialog";
import { MarkdownBody } from "./MarkdownBody";
import { InterfaceFeedback } from "./InterfaceFeedback";
import { Button } from "./ui/Button";

/** Opens the current version via the same owner-bound API as Agent Memory settings. */
export function AgentMemoryPreview({ resource, onClose }: {
  resource: { longAgentId: string; path: string; revision: string }; onClose: () => void;
}) {
  const { t } = useI18n();
  const [value, setValue] = useState<LongAgentMemoryRead | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setValue(null); setError(null);
    void readLongAgentMemory(resource.longAgentId, resource.path, controller.signal)
      .then(result => { if (!controller.signal.aborted) setValue(result); })
      .catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : String(cause)); });
    return () => controller.abort();
  }, [resource.longAgentId, resource.path, retry]);
  return <SurfaceDialog title={resource.path} description={t("chat.agentMemoryResource")} onClose={onClose}>
    <div className="agent-memory-preview">
      {error ? <div role="alert"><InterfaceFeedback message={error} /><Button variant="secondary" onClick={() => setRetry(v => v + 1)}>{t("interface.retry")}</Button></div>
        : !value ? <p role="status">{t("chat.resourceLoading")}</p>
        : <>
          {(value.stale || value.file.revision !== resource.revision) && <p role="status">{t(value.stale ? "chat.resourceStale" : "chat.resourceLatest")}</p>}
          <MarkdownBody>{value.file.content}</MarkdownBody>
        </>}
    </div>
  </SurfaceDialog>;
}
