"use client";

import type { CSSProperties } from "react";
import { agentAvatarHue, agentInitials } from "@/lib/agent-avatar";
import { longAgentAvatarImageUrl, type LongAgentAvatar } from "@/lib/long-agents-browser";
import styles from "./LongAgentAvatar.module.css";

/**
 * Renders one coworker's display avatar from the Backend-projected configuration:
 * managed image, configured emoji, or the identity color derived from the stable id.
 */
export function LongAgentAvatarView({
  agentId,
  name,
  avatar,
  size = 38,
}: {
  agentId: string;
  name: string;
  avatar: LongAgentAvatar;
  size?: number;
}) {
  const style = {
    "--agent-hue": agentAvatarHue(agentId),
    "--avatar-size": `${size}px`,
  } as CSSProperties;
  if (avatar.kind === "image") {
    return (
      <img
        className={`${styles.avatar} ${styles.image}`}
        style={style}
        src={longAgentAvatarImageUrl(agentId, avatar.revision)}
        alt=""
        loading="lazy"
      />
    );
  }
  return (
    <span className={styles.avatar} style={style} aria-hidden="true">
      {avatar.kind === "emoji"
        ? <span className={styles.emoji}>{avatar.emoji}</span>
        : agentInitials(name)}
    </span>
  );
}
