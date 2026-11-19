import type { Commit, Repo } from './types.ts';

export interface GraphNode {
  commit: Commit;
  row: number;
  col: number;
}

export interface GraphEdge {
  from: string;
  to: string;
  fromRow: number;
  toRow: number;
  fromCol: number;
  toCol: number;
}

export interface GraphLayout {
  nodes: GraphNode[];
  edges: GraphEdge[];
  rows: number;
  cols: number;
}

/** Lay commits out on lanes, newest at the top. Same idea as `git log --graph`. */
export function layoutGraph(repo: Repo, tips: string[]): GraphLayout {
  const reachable = new Set<string>();
  const stack = [...tips];
  while (stack.length) {
    const id = stack.pop() as string;
    if (reachable.has(id)) continue;
    const commit = repo.commits[id];
    if (!commit) continue;
    reachable.add(id);
    for (const parent of commit.parents) if (!reachable.has(parent)) stack.push(parent);
  }

  const ordered = [...reachable]
    .map((id) => repo.commits[id])
    .filter(Boolean)
    .sort((a, b) => b.time - a.time || b.id.localeCompare(a.id));

  const lanes: Array<string | null> = [];
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  ordered.forEach((commit, row) => {
    let col = lanes.indexOf(commit.id);
    if (col === -1) {
      col = lanes.findIndex((lane) => lane === null);
      if (col === -1) {
        col = lanes.length;
        lanes.push(null);
      }
    }
    lanes[col] = null;
    nodes.push({ commit, row, col });

    commit.parents.forEach((parent, parentIndex) => {
      if (!reachable.has(parent)) return;
      let parentCol = lanes.indexOf(parent);
      if (parentCol === -1) {
        if (parentIndex === 0 && lanes[col] === null) {
          parentCol = col;
        } else {
          parentCol = lanes.findIndex((lane) => lane === null);
          if (parentCol === -1) {
            parentCol = lanes.length;
            lanes.push(null);
          }
        }
        lanes[parentCol] = parent;
      }
      const parentRow = ordered.findIndex((c) => c.id === parent);
      edges.push({
        from: commit.id,
        to: parent,
        fromRow: row,
        toRow: parentRow,
        fromCol: col,
        toCol: parentCol,
      });
    });
  });

  return {
    nodes,
    edges,
    rows: ordered.length,
    cols: Math.max(1, lanes.length),
  };
}

export function collectTips(repo: Repo, all: boolean): string[] {
  const tips: string[] = [];
  if (repo.head.commit) tips.push(repo.head.commit);
  if (all) {
    tips.push(...Object.values(repo.branches));
    for (const remote of Object.values(repo.remotes)) tips.push(...Object.values(remote.tracking));
    tips.push(...Object.values(repo.tags));
  }
  return [...new Set(tips.filter((id) => id in repo.commits))];
}
