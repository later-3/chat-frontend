import type { FriendArtifact } from "./friend-artifacts";

export type ArtifactScope = { kind: "task" | "duty" | "work"; id: string };
/** Only authoritative source IDs associate results; names and dates never imply ownership. */
export function artifactMatchesScope(artifact: Pick<FriendArtifact, "taskId" | "dutyId" | "workId">, scope: ArtifactScope): boolean {
  return artifact[scope.kind === "task" ? "taskId" : scope.kind === "duty" ? "dutyId" : "workId"] === scope.id;
}
