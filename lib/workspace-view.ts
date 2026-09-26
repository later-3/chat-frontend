export type WorkspaceView = "chat" | "moments" | "groups" | "topics";

export function workspaceViewFromUrl(href: string): WorkspaceView {
  const view = new URL(href).searchParams.get("view");
  if (view === "moments") return "moments";
  if (view === "groups") return "groups";
  if (view === "topics") return "topics";
  return "chat";
}

/** Changes only the reading surface, retaining the selected Session and Project URL. */
export function workspaceViewUrl(href: string, view: WorkspaceView): string {
  const url = new URL(href);
  if (view === "chat") url.searchParams.delete("view");
  else url.searchParams.set("view", view);
  return `${url.pathname}${url.search}${url.hash}`;
}
