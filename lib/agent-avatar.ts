/**
 * Presentation helpers for Long Agent identity in the sidebar coworker list.
 * Colors are derived from the stable Agent id so a coworker keeps the same
 * avatar color across Sessions, Projects, and page reloads.
 */

/** Stable hue (0–359) for one Agent; the same id always maps to the same hue. */
export function agentAvatarHue(agentId: string): number {
  let hash = 0;
  for (const char of agentId) {
    hash = (hash * 31 + (char.codePointAt(0) ?? 0)) % 360;
  }
  return hash;
}

/** Avatar text: first letters of an ASCII multi-word name, otherwise the first character. */
export function agentInitials(name: string): string {
  const trimmed = name.trim();
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length === 0) return "A";
  if (/^[\x20-\x7e]+$/.test(trimmed)) {
    if (words.length > 1) return `${words[0][0]}${words[1][0]}`.toUpperCase();
    return Array.from(words[0]).slice(0, 2).join("").toUpperCase();
  }
  return Array.from(words[0]).slice(0, 1).join("");
}
