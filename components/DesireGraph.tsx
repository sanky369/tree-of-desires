"use client";

import { useEffect, useRef } from "react";
import type { ForceGraph3DInstance } from "3d-force-graph";
import type { Object3D } from "three";
import { nodes, links, type DesireNode } from "@/lib/desires";

export interface GraphHighlight {
  /** Ordered node ids, behavior -> root (already validated server-side). */
  path: string[];
  /** Label of a temporary leaf for novel ideas, attached to the first path node. */
  tempLabel: string | null;
}

interface Props {
  highlight: GraphHighlight | null;
}

type GNode = DesireNode & {
  x?: number; y?: number; z?: number;
  fx?: number; fy?: number; fz?: number;
};
type GLink = { source: string | GNode; target: string | GNode };

const TEMP_ID = "temp-idea";

// Node palette: ember roots underground, orchid desires at the forks, teal
// jobs on the branches, leaf-green behaviors as the canopy.
const LAYER_COLORS = ["#ffa14f", "#c77dff", "#2fd4b0", "#7ce38b"];
// nodeVal is volume-ish (radius ~ relSize * cbrt(val)) — these give visible
// radii of roughly 5.5 / 3.6 / 2.4 / 1.6 world units with nodeRelSize(1.6).
const LAYER_SIZES = [40, 11, 3.4, 1];
const DIM_NODE = "rgba(60,75,70,0.10)";
const DIM_LINK = "rgba(120,220,170,0.02)";
const BASE_LINK = "rgba(125,225,175,0.08)";
const PATH_COLOR = "#ffd54a";
const BG_COLOR = "#04120b";

const linkKey = (l: GLink) => {
  const s = typeof l.source === "object" ? l.source.id : l.source;
  const t = typeof l.target === "object" ? l.target.id : l.target;
  return `${s}->${t}`;
};

// Tooltip HTML interpolates node fields; the temp node's label originates from
// model output, so everything gets escaped.
const esc = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/* ------------------------------------------------------------------------ */
/* Procedural tree skeleton (seeded, deterministic)                          */
/* ------------------------------------------------------------------------ */

interface Vec { x: number; y: number; z: number }
interface Seg { a: Vec; b: Vec; r0: number; r1: number }

function mulberry32(seed: number) {
  let t = seed;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

const norm = (v: Vec): Vec => {
  const l = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / l, y: v.y / l, z: v.z / l };
};

/** Rotate `dir` away from itself by `angle`, around a random azimuth. */
function cone(dir: Vec, angle: number, azimuth: number): Vec {
  const d = norm(dir);
  const up: Vec = Math.abs(d.y) < 0.99 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
  const t1 = norm({ x: up.y * d.z - up.z * d.y, y: up.z * d.x - up.x * d.z, z: up.x * d.y - up.y * d.x });
  const t2 = { x: d.y * t1.z - d.z * t1.y, y: d.z * t1.x - d.x * t1.z, z: d.x * t1.y - d.y * t1.x };
  const s = Math.sin(angle);
  const c = Math.cos(angle);
  const ca = Math.cos(azimuth);
  const sa = Math.sin(azimuth);
  return norm({
    x: d.x * c + (t1.x * ca + t2.x * sa) * s,
    y: d.y * c + (t1.y * ca + t2.y * sa) * s,
    z: d.z * c + (t1.z * ca + t2.z * sa) * s,
  });
}

interface Skeleton {
  branchSegs: Seg[];
  rootSegs: Seg[];
  /** Branch endpoints keyed by depth (0 = trunk top ... maxDepth = twigs). */
  jointsByDepth: Vec[][];
  rootTips: Vec[];
}

function buildSkeleton(): Skeleton {
  const rand = mulberry32(20260704);
  const branchSegs: Seg[] = [];
  const rootSegs: Seg[] = [];
  const jointsByDepth: Vec[][] = [[], [], [], [], [], [], []];
  const rootTips: Vec[] = [];
  const MAX_DEPTH = 6;

  function grow(a: Vec, dir: Vec, len: number, r: number, depth: number) {
    // Gentle upward pull keeps the crown from sagging sideways.
    const d = norm({ x: dir.x, y: dir.y + 0.12, z: dir.z });
    const b = { x: a.x + d.x * len, y: a.y + d.y * len, z: a.z + d.z * len };
    const r1 = Math.max(0.25, r * 0.62);
    branchSegs.push({ a, b, r0: r, r1 });
    jointsByDepth[depth].push(b);
    if (depth >= MAX_DEPTH) return;
    const kids = depth === 0 ? 4 : rand() < 0.5 ? 3 : 2;
    for (let i = 0; i < kids; i++) {
      // Wide fork angles + slow length decay give a broad spreading crown
      // instead of a lollipop on a bare trunk. The first fork gets evenly
      // spaced azimuths so the crown stays radially balanced.
      const angle = (depth < 2 ? 0.55 : 0.42) + rand() * 0.5;
      const azimuth = depth === 0 ? (i / kids) * Math.PI * 2 + rand() * 0.7 : rand() * Math.PI * 2;
      const nextLen = depth === 0 ? len * (0.82 + rand() * 0.1) : len * (0.68 + rand() * 0.14);
      grow(b, cone(d, angle, azimuth), nextLen, r1, depth + 1);
    }
  }

  function growRoot(a: Vec, dir: Vec, len: number, r: number, depth: number) {
    const d = norm({ x: dir.x, y: dir.y - 0.3, z: dir.z });
    const b = { x: a.x + d.x * len, y: a.y + d.y * len, z: a.z + d.z * len };
    const r1 = Math.max(0.2, r * 0.55);
    rootSegs.push({ a, b, r0: r, r1 });
    if (depth >= 2) {
      rootTips.push(b);
      return;
    }
    const kids = rand() < 0.5 ? 3 : 2;
    for (let i = 0; i < kids; i++) {
      growRoot(b, cone(d, 0.5 + rand() * 0.5, rand() * Math.PI * 2), len * 0.72, r1, depth + 1);
    }
  }

  grow({ x: 0, y: -10, z: 0 }, { x: 0, y: 1, z: 0 }, 42, 5.5, 0);
  for (let i = 0; i < 6; i++) {
    const az = (i / 6) * Math.PI * 2 + rand() * 0.6;
    growRoot(
      { x: 0, y: -8, z: 0 },
      norm({ x: Math.cos(az) * 0.9, y: -0.55, z: Math.sin(az) * 0.9 }),
      30 + rand() * 10,
      3.2,
      0,
    );
  }

  return { branchSegs, rootSegs, jointsByDepth, rootTips };
}

/** Deterministically pick `n` well-spread points from a pool (pad by jitter). */
function pick(pool: Vec[], n: number, rand: () => number, jitter: number): Vec[] {
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const out = shuffled.slice(0, n);
  while (out.length < n && shuffled.length > 0) {
    const base = shuffled[out.length % shuffled.length];
    out.push({
      x: base.x + (rand() - 0.5) * jitter,
      y: base.y + (rand() - 0.5) * jitter,
      z: base.z + (rand() - 0.5) * jitter,
    });
  }
  return out;
}

const SKELETON = buildSkeleton();

// Every ontology node gets a fixed home on the skeleton: primal roots on the
// root tips, basic desires at the lower forks, jobs on the mid branches,
// behaviors on the terminal twigs (the canopy).
const NODE_POSITIONS: Record<string, Vec> = (() => {
  const rand = mulberry32(97);
  const { jointsByDepth, rootTips } = SKELETON;
  const pools: Vec[][] = [
    rootTips,
    [...jointsByDepth[1], ...jointsByDepth[2]],
    [...jointsByDepth[3], ...jointsByDepth[4]],
    [...jointsByDepth[5], ...jointsByDepth[6]],
  ];
  const out: Record<string, Vec> = {};
  for (let layer = 0; layer <= 3; layer++) {
    const layerNodes = nodes.filter((n) => n.layer === layer);
    const spots = pick(pools[layer], layerNodes.length, rand, 10);
    layerNodes.forEach((n, i) => {
      out[n.id] = spots[i];
    });
  }
  return out;
})();

/* ------------------------------------------------------------------------ */

export default function DesireGraph({ highlight }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<ForceGraph3DInstance<GNode, GLink> | null>(null);
  // Accessors read these refs so a highlight change only needs a re-style pass.
  const pathNodesRef = useRef<Set<string>>(new Set());
  const pathLinksRef = useRef<Set<string>>(new Set());
  const dimmedRef = useRef(false);

  useEffect(() => {
    let disposed = false;
    let onResize: (() => void) | null = null;
    let rafId = 0;

    (async () => {
      const [{ default: ForceGraph3D }, { default: SpriteText }, THREE, { UnrealBloomPass }] =
        await Promise.all([
          import("3d-force-graph"),
          import("three-spritetext"),
          import("three"),
          import("three/examples/jsm/postprocessing/UnrealBloomPass.js"),
        ]);
      if (disposed || !containerRef.current) return;

      const graph = new ForceGraph3D(containerRef.current) as unknown as ForceGraph3DInstance<
        GNode,
        GLink
      >;
      graphRef.current = graph;

      graph
        .backgroundColor(BG_COLOR)
        .showNavInfo(false)
        .graphData({
          // All nodes are pinned to their sampled spot on the skeleton — the
          // tree shape is authored, not simulated.
          nodes: nodes.map((n) => {
            const p = NODE_POSITIONS[n.id];
            return { ...n, fx: p.x, fy: p.y, fz: p.z, x: p.x, y: p.y, z: p.z };
          }),
          links: links.map((l) => ({ ...l })),
        })
        .cooldownTicks(0)
        .nodeRelSize(1.6)
        .nodeVal((n) => LAYER_SIZES[n.layer] ?? 1)
        .nodeResolution(20)
        .nodeOpacity(0.92)
        .nodeColor(nodeColor)
        .nodeLabel((n) => {
          // While a trace is highlighted, dimmed nodes are inert: no tooltip.
          if (dimmedRef.current && !pathNodesRef.current.has(n.id)) return "";
          return `<div style="max-width:230px;padding:8px 11px;background:rgba(4,12,8,.94);border:1px solid rgba(255,255,255,.09);border-radius:10px;font-size:12px;line-height:1.45;color:#e7efe9;backdrop-filter:blur(6px)">
              <b style="font-weight:600">${esc(n.label)}</b>
              <div style="color:#93ac9e;margin-top:3px">${esc(n.description)}</div>
              <div style="color:#587a68;margin-top:5px;font-size:10px;text-transform:uppercase;letter-spacing:.08em">${esc(n.framework)}</div>
            </div>`;
        })
        .nodeThreeObjectExtend(true)
        .nodeThreeObject((n: GNode) => {
          // Falsy return keeps the plain sphere. Only primal roots and the
          // temp node carry a permanent label — and while a trace is
          // highlighted, only labels on the path survive.
          const isRoot = n.layer === 0;
          if (!isRoot && n.id !== TEMP_ID) return false as unknown as Object3D;
          if (dimmedRef.current && !pathNodesRef.current.has(n.id)) {
            return false as unknown as Object3D;
          }
          const sprite = new SpriteText(n.label.toUpperCase());
          sprite.color = n.id === TEMP_ID ? PATH_COLOR : "rgba(255,228,208,0.95)";
          sprite.textHeight = n.id === TEMP_ID ? 3.6 : 3.2;
          sprite.fontWeight = "600";
          sprite.material.depthWrite = false;
          if (isRoot) {
            // Labels fan away from the trunk, below the root tips, at three
            // staggered depths so neighbouring labels never collide.
            const p = NODE_POSITIONS[n.id];
            const dir = norm({ x: p.x, y: 0, z: p.z });
            const stagger = [...n.id].reduce((a, ch) => a + ch.charCodeAt(0), 0) % 3;
            sprite.position.set(dir.x * 16, -6 - stagger * 6, dir.z * 16);
          } else {
            sprite.position.set(0, 7, 0);
          }
          return sprite;
        })
        .linkColor(linkColor)
        .linkWidth((l) => (pathLinksRef.current.has(linkKey(l)) ? 1.4 : 0))
        .linkOpacity(1)
        .linkDirectionalParticles((l) => (pathLinksRef.current.has(linkKey(l)) ? 4 : 0))
        .linkDirectionalParticleWidth(2.2)
        .linkDirectionalParticleSpeed(0.008)
        .linkDirectionalParticleColor(() => PATH_COLOR);

      /* ---- procedural tree mesh: dark branches, ghost-pale roots ---- */
      const treeGroup = new THREE.Group();
      const branchMat = new THREE.MeshLambertMaterial({ color: "#170f08" });
      const rootMat = new THREE.MeshBasicMaterial({
        color: "#cfc6b8",
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
      });
      const yAxis = new THREE.Vector3(0, 1, 0);
      const addSegs = (segs: Seg[], mat: InstanceType<typeof THREE.Material>) => {
        for (const s of segs) {
          const dir = new THREE.Vector3(s.b.x - s.a.x, s.b.y - s.a.y, s.b.z - s.a.z);
          const len = dir.length();
          if (len < 0.01) continue;
          const geo = new THREE.CylinderGeometry(s.r1, s.r0, len, 5);
          const mesh = new THREE.Mesh(geo, mat);
          mesh.position.set((s.a.x + s.b.x) / 2, (s.a.y + s.b.y) / 2, (s.a.z + s.b.z) / 2);
          mesh.quaternion.setFromUnitVectors(yAxis, dir.normalize());
          treeGroup.add(mesh);
        }
      };
      addSegs(SKELETON.branchSegs, branchMat);
      addSegs(SKELETON.rootSegs, rootMat);
      graph.scene().add(treeGroup);

      /* ---- jungle atmosphere: fog + drifting fireflies ---- */
      graph.scene().fog = new THREE.FogExp2(BG_COLOR, 0.00075);

      const FF_COUNT = 90;
      const ffBase = new Float32Array(FF_COUNT * 3);
      const ffPhase = new Float32Array(FF_COUNT);
      const ffRand = mulberry32(7);
      for (let i = 0; i < FF_COUNT; i++) {
        ffBase[i * 3] = (ffRand() - 0.5) * 480;
        ffBase[i * 3 + 1] = -70 + ffRand() * 330;
        ffBase[i * 3 + 2] = (ffRand() - 0.5) * 480;
        ffPhase[i] = ffRand() * Math.PI * 2;
      }
      const ffGeo = new THREE.BufferGeometry();
      ffGeo.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(ffBase), 3));
      const fireflies = new THREE.Points(
        ffGeo,
        new THREE.PointsMaterial({
          color: "#d8f28e",
          size: 1.7,
          transparent: true,
          opacity: 0.55,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      graph.scene().add(fireflies);

      const drift = () => {
        const t = performance.now() / 1000;
        const pos = ffGeo.getAttribute("position");
        for (let i = 0; i < FF_COUNT; i++) {
          const ph = ffPhase[i];
          pos.setXYZ(
            i,
            ffBase[i * 3] + Math.sin(t * 0.35 + ph) * 14,
            ffBase[i * 3 + 1] + Math.sin(t * 0.22 + ph * 2) * 10,
            ffBase[i * 3 + 2] + Math.cos(t * 0.28 + ph) * 14,
          );
        }
        pos.needsUpdate = true;
        rafId = requestAnimationFrame(drift);
      };
      rafId = requestAnimationFrame(drift);

      // The soft glow: same technique as the library's bloom example, tuned
      // so the node-web and fireflies halo while the dark wood stays matte.
      const bloom = new UnrealBloomPass(
        new THREE.Vector2(containerRef.current.clientWidth, containerRef.current.clientHeight),
        0.5,
        0.35,
        0.25,
      );
      graph.postProcessingComposer().addPass(bloom);

      // Slow idle orbit until a trace takes over the camera.
      const controls = graph.controls() as { autoRotate?: boolean; autoRotateSpeed?: number };
      controls.autoRotate = true;
      controls.autoRotateSpeed = 0.45;

      onResize = () => {
        if (!containerRef.current) return;
        graph.width(containerRef.current.clientWidth).height(containerRef.current.clientHeight);
      };
      onResize();
      window.addEventListener("resize", onResize);

      // Frame the tree once the first paint is done (the highlight effect
      // can't do it on mount — the graph doesn't exist yet at that point).
      setTimeout(() => {
        if (!disposed) graph.zoomToFit(800, 55);
      }, 800);
    })();

    function nodeColor(n: GNode): string {
      if (!dimmedRef.current) return LAYER_COLORS[n.layer] ?? "#7d8899";
      if (n.id === TEMP_ID) return PATH_COLOR;
      return pathNodesRef.current.has(n.id) ? LAYER_COLORS[n.layer] : DIM_NODE;
    }
    function linkColor(l: GLink): string {
      if (pathLinksRef.current.has(linkKey(l))) return PATH_COLOR;
      return dimmedRef.current ? DIM_LINK : BASE_LINK;
    }

    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      if (onResize) window.removeEventListener("resize", onResize);
      graphRef.current?._destructor();
      graphRef.current = null;
    };
  }, []);

  // Apply / clear highlight whenever the trace changes.
  useEffect(() => {
    const graph = graphRef.current;
    if (!graph) return;

    // Remove any previous temp node.
    const data = graph.graphData();
    const hadTemp = data.nodes.some((n) => n.id === TEMP_ID);
    let nextNodes = hadTemp ? data.nodes.filter((n) => n.id !== TEMP_ID) : data.nodes;
    let nextLinks = hadTemp
      ? data.links.filter((l) => !linkKey(l).includes(TEMP_ID))
      : data.links;

    const pathNodes = new Set<string>();
    const pathLinks = new Set<string>();

    if (highlight && highlight.path.length > 0) {
      highlight.path.forEach((id) => pathNodes.add(id));
      // path is ordered behavior -> root; ontology edges point parent -> child.
      for (let i = 0; i < highlight.path.length - 1; i++) {
        pathLinks.add(`${highlight.path[i + 1]}->${highlight.path[i]}`);
      }
      if (highlight.tempLabel) {
        // A novel idea sprouts as a new twig just beyond its anchor job.
        const anchor = highlight.path[0];
        const ap = NODE_POSITIONS[anchor] ?? { x: 0, y: 120, z: 0 };
        const dir = norm({ x: ap.x, y: 0.6, z: ap.z });
        const tp = { x: ap.x + dir.x * 34, y: ap.y + 22, z: ap.z + dir.z * 34 };
        nextNodes = [
          ...nextNodes,
          {
            id: TEMP_ID,
            label: highlight.tempLabel,
            layer: 3,
            parents: [anchor],
            description: "Your idea (novel behavior, not yet in the tree)",
            framework: "behavior",
            fx: tp.x, fy: tp.y, fz: tp.z, x: tp.x, y: tp.y, z: tp.z,
          } as GNode,
          ];
        nextLinks = [...nextLinks, { source: anchor, target: TEMP_ID }];
        pathNodes.add(TEMP_ID);
        pathLinks.add(`${anchor}->${TEMP_ID}`);
      }
    }

    pathNodesRef.current = pathNodes;
    pathLinksRef.current = pathLinks;
    dimmedRef.current = pathNodes.size > 0;

    // Camera: hand control to the trace, give it back to the idle orbit on reset.
    const controls = graph.controls() as { autoRotate?: boolean };
    controls.autoRotate = pathNodes.size === 0;

    if (hadTemp || (highlight?.tempLabel && pathNodes.size > 0)) {
      graph.graphData({ nodes: nextNodes, links: nextLinks });
    }

    // Re-assign accessors so the styling refs are re-evaluated.
    graph
      .nodeColor(graph.nodeColor())
      .linkColor(graph.linkColor())
      .linkWidth(graph.linkWidth())
      .linkDirectionalParticles(graph.linkDirectionalParticles())
      .nodeThreeObject(graph.nodeThreeObject());

    if (pathNodes.size > 0) {
      // Positions are pinned, so framing can happen right after the paint.
      const timer = setTimeout(() => {
        const g = graphRef.current;
        if (!g) return;
        const onPath = g.graphData().nodes.filter((n) => pathNodes.has(n.id));
        if (!onPath.length) return;
        const c = onPath.reduce(
          (acc, n) => ({ x: acc.x + (n.x ?? 0), y: acc.y + (n.y ?? 0), z: acc.z + (n.z ?? 0) }),
          { x: 0, y: 0, z: 0 },
        );
        c.x /= onPath.length;
        c.y /= onPath.length;
        c.z /= onPath.length;
        // Back the camera off proportionally to how far the path sprawls, so
        // both ends of long behavior->root chains stay in frame.
        const spread = Math.max(
          60,
          ...onPath.map((n) => Math.hypot((n.x ?? 0) - c.x, (n.y ?? 0) - c.y, (n.z ?? 0) - c.z)),
        );
        // Always frame from the FRONT: a horizontal bearing plus a gentle
        // ~18° elevation. Face the path's side of the tree; when the path
        // hugs the trunk axis, keep the user's current bearing instead of
        // letting a vertical component dominate (which put the camera on top).
        let hx = c.x;
        let hz = c.z;
        let hLen = Math.hypot(hx, hz);
        if (hLen < 20) {
          const cam = g.cameraPosition() as { x: number; y: number; z: number };
          hx = cam.x - c.x;
          hz = cam.z - c.z;
          hLen = Math.hypot(hx, hz) || 1;
        }
        hx /= hLen;
        hz /= hLen;
        const dist = spread * 2.6 + 130;
        g.cameraPosition(
          { x: c.x + hx * dist * 0.95, y: c.y + dist * 0.32, z: c.z + hz * dist * 0.95 },
          c,
          1400,
        );
      }, 350);
      return () => clearTimeout(timer);
    } else {
      graph.zoomToFit(1000, 70);
    }
  }, [highlight]);

  return <div ref={containerRef} className="absolute inset-0" />;
}
