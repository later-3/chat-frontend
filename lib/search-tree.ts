export interface SearchTreeNode {
  name: string;
  /** Full relative path of this node, e.g. "components/App.tsx" or "components". */
  path: string;
  isDir: boolean;
  children: SearchTreeNode[];
}

/** Folds flat matching file paths into a sorted directory tree. */
export function buildSearchTree(paths: string[]): SearchTreeNode[] {
  const roots: SearchTreeNode[] = [];
  const byPath = new Map<string, SearchTreeNode>();
  for (const relative of paths) {
    const segments = relative.split("/").filter(Boolean);
    let current = roots;
    let currentPath = "";
    for (let index = 0; index < segments.length; index += 1) {
      currentPath = currentPath ? `${currentPath}/${segments[index]}` : segments[index];
      let node = byPath.get(currentPath);
      if (node === undefined) {
        node = {
          name: segments[index],
          path: currentPath,
          isDir: index < segments.length - 1,
          children: [],
        };
        byPath.set(currentPath, node);
        current.push(node);
      }
      current = node.children;
    }
  }

  const sort = (nodes: SearchTreeNode[]) => {
    nodes.sort((left, right) => (
      left.isDir !== right.isDir
        ? left.isDir ? -1 : 1
        : left.name.localeCompare(right.name)
    ));
    nodes.forEach((node) => sort(node.children));
  };
  sort(roots);
  return roots;
}
