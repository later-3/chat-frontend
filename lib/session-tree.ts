import type { SessionInfo } from "./types";

export interface SidebarSessionTreeNode {
  session: SessionInfo;
  children: SidebarSessionTreeNode[];
  /** Direct and nested Sessions currently waiting for a human. */
  attentionCount: number;
}

/** Builds the existing Session hierarchy and folds attention up collapsed ancestors. */
export function buildSidebarSessionTree(sessions: readonly SessionInfo[]): SidebarSessionTreeNode[] {
  const byId = new Map<string, SidebarSessionTreeNode>();
  for (const session of sessions) {
    byId.set(session.id, { session, children: [], attentionCount: 0 });
  }

  const parentOf = new Map<string, string>();
  for (const session of sessions) {
    if (session.parentSessionId) parentOf.set(session.id, session.parentSessionId);
  }

  function resolveAncestor(id: string): string | null {
    let current = parentOf.get(id);
    const visited = new Set<string>();
    while (current) {
      if (visited.has(current)) return null;
      visited.add(current);
      if (byId.has(current)) return current;
      current = parentOf.get(current);
    }
    return null;
  }

  const roots: SidebarSessionTreeNode[] = [];
  for (const node of byId.values()) {
    const ancestor = resolveAncestor(node.session.id);
    if (ancestor) byId.get(ancestor)?.children.push(node);
    else roots.push(node);
  }

  const finalize = (nodes: SidebarSessionTreeNode[]): void => {
    nodes.sort((left, right) => right.session.modified.localeCompare(left.session.modified));
    for (const node of nodes) {
      finalize(node.children);
      node.attentionCount = (node.session.attention === undefined ? 0 : 1)
        + node.children.reduce((total, child) => total + child.attentionCount, 0);
    }
  };
  finalize(roots);
  return roots;
}
