export type WorkspaceView = "chat" | "moments";

export function workspaceViewFromUrl(href: string): WorkspaceView {
  return new URL(href).searchParams.get("view") === "moments" ? "moments" : "chat";
}

/** Changes only the reading surface, retaining the selected Session and Project URL. */
export function workspaceViewUrl(href: string, view: WorkspaceView): string {
  const url = new URL(href);
  if (view === "moments") url.searchParams.set("view", view);
  else url.searchParams.delete("view");
  return `${url.pathname}${url.search}${url.hash}`;
}
