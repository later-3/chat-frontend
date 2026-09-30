"use client";

import { useI18n } from "@/hooks/useI18n";
import { getFileName } from "@/lib/file-paths";
import type { WrittenFile } from "@/lib/turn-written-files";
import { getFileIcon } from "./FileIcons";
import { useState } from "react";
import { Button } from "./ui/Button";
import { AgentMemoryPreview } from "./AgentMemoryPreview";

/**
 * Lists the files a turn actually wrote, as buttons that open each one in the
 * preview pane. Entries come from the turn's successful `write`/`edit` tool
 * calls — the reply text is never scanned for paths.
 */
export function TurnWrittenFiles({ files, onOpenFile }: {
  files: WrittenFile[];
  onOpenFile?: (filePath: string) => void;
}) {
  const { t } = useI18n();
  const [memory, setMemory] = useState<Extract<WrittenFile, { kind: "agent-memory" }> | null>(null);
  if (files.length === 0) return null;

  return (
    <div aria-label={t("chat.resourcesWritten")} className="turn-written-resources">
      {files.map(file => {
        const filePath = file.kind === "agent-memory" ? file.path : file.filePath;
        const name = getFileName(filePath);
        return (
          <Button
            variant="ghost"
            key={file.kind === "agent-memory" ? `${file.longAgentId}:${filePath}` : filePath}
            type="button"
            title={filePath}
            aria-label={t("chat.openWrittenFile", { name })}
            onClick={() => file.kind === "agent-memory" ? setMemory(file) : onOpenFile?.(filePath)}
          >
            {getFileIcon(name, 12)}
            <span>{name}</span>
            {file.kind === "agent-memory" && <span>{t("chat.agentMemoryResource")}</span>}
          </Button>
        );
      })}
      {memory && <AgentMemoryPreview key={`${memory.longAgentId}:${memory.path}`} resource={memory} onClose={() => setMemory(null)} />}
    </div>
  );
}
