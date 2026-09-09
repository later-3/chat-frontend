"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import {
  deleteLongAgentAvatar,
  saveLongAgentConfiguration,
  uploadLongAgentAvatar,
  type LongAgentConfigurationDocument,
} from "@/lib/long-agents-browser";
import { LongAgentAvatarView } from "./LongAgentAvatar";
import styles from "./LongAgentAvatarEditor.module.css";

/**
 * Avatar edits apply immediately through the avatar/config endpoints and return
 * a fresh configuration document; they never mix with the unsaved form draft.
 */
export function LongAgentAvatarEditor({
  document,
  onUpdated,
}: {
  document: LongAgentConfigurationDocument;
  onUpdated: (next: LongAgentConfigurationDocument) => void;
}) {
  const { t } = useI18n();
  const fileRef = useRef<HTMLInputElement>(null);
  const avatar = document.agent.avatar;
  const [emoji, setEmoji] = useState(avatar.kind === "emoji" ? avatar.emoji : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setEmoji(avatar.kind === "emoji" ? avatar.emoji : "");
  }, [avatar]);

  const run = async (action: () => Promise<LongAgentConfigurationDocument>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      onUpdated(await action());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  // Display-kind changes reuse the configuration contract with the server
  // baseline (not the unsaved draft), so a draft edit is never silently saved.
  const applyDisplay = (next: { kind: "auto" } | { kind: "emoji"; emoji: string }) => run(() => (
    saveLongAgentConfiguration(document.agent.id, document.revision, {
      name: document.agent.name,
      description: document.agent.description,
      avatar: next,
      enabled: document.agent.enabled,
      defaultProjectId: document.agent.defaultProjectId,
      definition: document.agent.definition,
    })
  ));

  const upload = (file: File) => run(() => uploadLongAgentAvatar({
    longAgentId: document.agent.id,
    bytes: file,
    expectedRevision: document.revision,
  }));

  return (
    <div className={styles.editor}>
      <span className={styles.preview}>
        <LongAgentAvatarView agentId={document.agent.id} name={document.agent.name} avatar={avatar} size={56} />
      </span>
      <div className={styles.controls}>
        <div className={styles.row}>
          <button
            type="button"
            className={styles.button}
            disabled={busy}
            onClick={() => fileRef.current?.click()}
          >
            {t("longAgentSettings.avatarUpload")}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file !== undefined) void upload(file);
            }}
          />
          <input
            type="text"
            value={emoji}
            maxLength={16}
            placeholder={t("longAgentSettings.avatarEmojiPlaceholder")}
            aria-label={t("longAgentSettings.avatarEmojiPlaceholder")}
            onChange={(event) => setEmoji(event.target.value)}
          />
          <button
            type="button"
            className={styles.button}
            disabled={busy || emoji.trim() === ""}
            onClick={() => void applyDisplay({ kind: "emoji", emoji: emoji.trim() })}
          >
            {t("longAgentSettings.avatarApplyEmoji")}
          </button>
          {avatar.kind !== "auto" && (
            <button
              type="button"
              className={styles.button}
              disabled={busy}
              onClick={() => {
                if (avatar.kind === "image") {
                  void run(() => deleteLongAgentAvatar({
                    longAgentId: document.agent.id,
                    expectedRevision: document.revision,
                  }));
                } else {
                  void applyDisplay({ kind: "auto" });
                }
              }}
            >
              {t("longAgentSettings.avatarReset")}
            </button>
          )}
        </div>
        <p className={styles.hint}>{t("longAgentSettings.avatarHelp")}</p>
        {error && <p className={styles.error} role="alert">{error}</p>}
      </div>
    </div>
  );
}
