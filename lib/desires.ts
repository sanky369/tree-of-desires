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
