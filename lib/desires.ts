import raw from "@/data/desires.json";

export interface DesireNode {
  id: string;
  label: string;
  layer: 0 | 1 | 2 | 3;
  parents: string[];
  description: string;
  framework: string;
}

export interface DesireLink {
  source: string; // parent (closer to root)
  target: string; // child (closer to behavior)
}

export interface TraceScores {
  rootDepth: number;
  directness: number;
  rootStrength: number;
  frequency: number;
}

export interface TraceResult {
  matchedBehaviorId: string | null;
  newBehaviorLabel: string | null;
  path: string[]; // ordered node ids, behavior -> root
  /** Alternate behavior->root paths (distinct roots), derived from the ontology. */
  altPaths: string[][];
  /** True when the model's stalled path was completed along real edges. */
  pathRepaired: boolean;
  rootDesireId: string | null;
  reachedRoot: boolean;
  rationale: string;
  scores: TraceScores;
  totalScore: number;
  verdict: string;
}

export const nodes: DesireNode[] = (raw as { nodes: DesireNode[] }).nodes;

export const nodeById = new Map<string, DesireNode>(nodes.map((n) => [n.id, n]));

// Edges point parent -> child so that with dagMode "radialout" the layer-0
// roots (no incoming links) cluster at the center and behaviors radiate out.
export const links: DesireLink[] = nodes.flatMap((n) =>
  n.parents.map((p) => ({ source: p, target: n.id })),
);

export function nodesByLayer(layer: number): DesireNode[] {
  return nodes.filter((n) => n.layer === layer);
}

/** True if `parentId` is a direct parent of `childId` in the ontology. */
export function isParentOf(parentId: string, childId: string): boolean {
  return nodeById.get(childId)?.parents.includes(parentId) ?? false;
}

/**
 * Validate a model-proposed path (ordered behavior -> root). Every hop must be
 * a real edge; a hop from a temporary/new node (not in the ontology) is allowed
 * only as the first element. Returns the longest valid prefix.
 */
export function sanitizePath(path: string[]): string[] {
  const clean: string[] = [];
  for (let i = 0; i < path.length; i++) {
    const id = path[i];
    if (!nodeById.has(id)) {
      if (i === 0) continue; // model may echo a new-behavior placeholder first
      break;
    }
    if (clean.length > 0 && !isParentOf(id, clean[clean.length - 1])) break;
    clean.push(id);
  }
  return clean;
}

/**
 * Shortest path (node ids, `fromId` first) from a node inward to a layer-0
 * root, following parent edges. BFS in declared parent order, so the result
 * is deterministic. When `preferRootId` is reachable it is targeted first;
 * otherwise the nearest root wins. Returns null only for unknown ids.
 */
export function shortestRootPath(fromId: string, preferRootId?: string | null): string[] | null {
  const start = nodeById.get(fromId);
  if (!start) return null;
  if (start.layer === 0) return [fromId];

  const prev = new Map<string, string>(); // child in path -> its parent hop
  const queue: string[] = [fromId];
  const seen = new Set<string>([fromId]);
  let fallback: string | null = null; // first (nearest) root found

  while (queue.length > 0) {
    const id = queue.shift()!;
    for (const p of nodeById.get(id)?.parents ?? []) {
      if (seen.has(p) || !nodeById.has(p)) continue;
      seen.add(p);
      prev.set(p, id);
      if (nodeById.get(p)!.layer === 0) {
        if (!preferRootId || p === preferRootId) return unwind(p, prev, fromId);
        fallback ??= p;
        continue; // keep searching for the preferred root
      }
      queue.push(p);
    }
  }
  return fallback ? unwind(fallback, prev, fromId) : null;
}

function unwind(rootId: string, prev: Map<string, string>, fromId: string): string[] {
  const path = [rootId];
  let cur = rootId;
  while (cur !== fromId) {
    cur = prev.get(cur)!;
    path.push(cur);
  }
  return path.reverse();
}

/**
 * Extend a sanitized-but-stalled path (behavior -> ...) to a layer-0 root
 * along real edges. Returns the completed path plus whether anything was
 * appended. Never rewrites the hops the model already got right.
 */
export function completeToRoot(
  path: string[],
  preferRootId?: string | null,
): { path: string[]; repaired: boolean } {
  if (path.length === 0) return { path, repaired: false };
  const last = path[path.length - 1];
  if (nodeById.get(last)?.layer === 0) return { path, repaired: false };
  const tail = shortestRootPath(last, preferRootId);
  if (!tail) return { path, repaired: false };
  return { path: [...path, ...tail.slice(1)], repaired: true };
}

/**
 * Up to `max` alternate root paths for a node, each entering through a
 * different direct parent than the primary path and terminating at a root the
 * primary (and earlier alternates) did not reach. Multi-parent nodes are the
 * norm in this ontology, so most ideas genuinely feed several primal desires —
 * this surfaces the strongest of those secondary lineages deterministically.
 */
export function alternateRootPaths(fromId: string, primary: string[], max = 2): string[][] {
  const node = nodeById.get(fromId);
  if (!node || node.layer === 0) return [];
  const usedRoots = new Set<string>();
  const primaryRoot = primary[primary.length - 1];
  if (nodeById.get(primaryRoot)?.layer === 0) usedRoots.add(primaryRoot);
  const primaryFirstHop = primary.length > 1 && primary[0] === fromId ? primary[1] : null;

  const candidates: string[][] = [];
  for (const p of node.parents) {
    if (p === primaryFirstHop || !nodeById.has(p)) continue;
    const tail = shortestRootPath(p);
    if (tail) candidates.push([fromId, ...tail]);
  }
  candidates.sort((a, b) => a.length - b.length);

  const out: string[][] = [];
  for (const c of candidates) {
    const root = c[c.length - 1];
    if (usedRoots.has(root)) continue;
    usedRoots.add(root);
    out.push(c);
    if (out.length >= max) break;
  }
  return out;
}
