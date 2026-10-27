/**
 * Plane geometry the shape table and the marks share: points, boxes, a block's raised side, and the
 * thread drawn from one section into the next.
 *
 * Coordinates are in block edges (a triangle's side is 1), y down.
 */
import type { Role } from "./types.ts";

export type Pt = { x: number; y: number };
/** The colour each section type is drawn in, named for the pattern block it once was. */
export type ShapeName = "hexagon" | "trapezoid" | "rhombus" | "triangle" | "square" | "thin";

/** Each section type's colour, and whether it is drawn hollow (the rarer types reuse a colour). */
export const BLOCK_OF: Record<Role, { shape: ShapeName; hollow: boolean }> = {
  chorus: { shape: "hexagon", hollow: false },
  verse: { shape: "rhombus", hollow: false },
  prechorus: { shape: "trapezoid", hollow: false },
  bridge: { shape: "triangle", hollow: false },
  intro: { shape: "square", hollow: false },
  outro: { shape: "thin", hollow: false },
  solo: { shape: "hexagon", hollow: true },
  instrumental: { shape: "trapezoid", hollow: true },
  interlude: { shape: "rhombus", hollow: true },
  transition: { shape: "triangle", hollow: true },
  coda: { shape: "square", hollow: true },
};

export const translate = (pts: Pt[], d: Pt) => pts.map((p) => ({ x: p.x + d.x, y: p.y + d.y }));

function signedArea(pts: Pt[]): number {
  return pts.reduce((s, p, i) => {
    const q = pts[(i + 1) % pts.length]!;
    return s + p.x * q.y - q.x * p.y;
  }, 0) / 2;
}

/** Corners wound clockwise on screen (positive area with y down). */
function wound(pts: Pt[]): Pt[] {
  return signedArea(pts) < 0 ? pts.slice().reverse() : pts;
}

export function bounds(pts: Pt[]): { left: number; top: number; right: number; bottom: number } {
  return {
    left: Math.min(...pts.map((p) => p.x)),
    top: Math.min(...pts.map((p) => p.y)),
    right: Math.max(...pts.map((p) => p.x)),
    bottom: Math.max(...pts.map((p) => p.y)),
  };
}

/** The convex hull of some points (Andrew's monotone chain), wound like the blocks. */
export function hull(points: Pt[]): Pt[] {
  const p = points.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Pt[] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower.at(-2)!, lower.at(-1)!, q) <= 1e-9) lower.pop();
    lower.push(q);
  }
  const upper: Pt[] = [];
  for (const q of p.slice().reverse()) {
    while (upper.length >= 2 && cross(upper.at(-2)!, upper.at(-1)!, q) <= 1e-9) upper.pop();
    upper.push(q);
  }
  return wound([...lower.slice(0, -1), ...upper.slice(0, -1)]);
}

/** How far a block stands off the table, in edge lengths: its raised side is this tall. */
export const DEPTH = 0.13;

/**
 * A block's raised side: the outline of its top face and the same face DEPTH lower, which is what
 * shows of the block's edge below its top, the way a plastic pattern block stands on a table.
 */
export function sideOf(pts: Pt[], depth = DEPTH): Pt[] {
  return hull([...pts, ...translate(pts, { x: 0, y: depth })]);
}

/**
 * The thread from one section into the next, in table units: from the right of the section's
 * last bar to the left of the next one's first. A section further along the same row gets a
 * gentle S-curve, however tall either section is; one on a later row gets a path that drops into
 * the gap above it and comes in from the left, like a line of text wrapping.
 */
export function threadPath(fromBlock: Pt[], toBlock: Pt[], toTop: number, sameRow: boolean): { d: string; mid: Pt } {
  const a = bounds(fromBlock);
  const b = bounds(toBlock);
  const start = { x: a.right + 0.08, y: (a.top + a.bottom) / 2 };
  const end = { x: b.left - 0.12, y: (b.top + b.bottom) / 2 };
  if (sameRow && end.x > start.x + 0.2) {
    const k = Math.max(0.3, (end.x - start.x) / 2);
    return {
      d: `M${start.x},${start.y} C${start.x + k},${start.y} ${end.x - k},${end.y} ${end.x},${end.y}`,
      mid: { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 },
    };
  }
  // Wrap: out to the right, along the gap above the next section's label, down into its left side.
  const gap = toTop - 0.85;
  const out = start.x + 0.35;
  // For a section at the table's left edge this runs down the table's left gutter (see the table).
  const into = end.x - 0.4;
  const r = 0.25;
  const d = [
    `M${start.x},${start.y}`,
    `L${out - r},${start.y}`,
    `Q${out},${start.y} ${out},${start.y + Math.sign(gap - start.y) * r}`,
    `L${out},${gap - Math.sign(gap - start.y) * r}`,
    `Q${out},${gap} ${out - r},${gap}`,
    `L${into + r},${gap}`,
    `Q${into},${gap} ${into},${gap + r}`,
    `L${into},${end.y - r}`,
    `Q${into},${end.y} ${into + r},${end.y}`,
    `L${end.x},${end.y}`,
  ].join(" ");
  return { d, mid: { x: (out + into) / 2, y: gap } };
}
