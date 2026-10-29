/**
 * The shape table as `<lattice-board>` pieces: the song laid out on the kit's own lattice, and the
 * song read back from whatever the board's pieces have become.
 *
 * Every bar is a shape made of the lattice's triangles: a bridge bar is one triangle, a verse two
 * (a rhombus), a pre-chorus three (a trapezoid), a chorus six (the whole cell), an intro four as a
 * big triangle and an outro four as a long rhombus. A section is the parts of one colour (`tone`) in a board piece
 * that touch, so its bars are its triangles over its bar's size; a change that would leave part of
 * a bar is refused. Pieces of the same colour side by side stay separate sections until glued (G).
 *
 * Coordinates are the kit's: pixels at `scale` 1, a cell 76.21 across and rows 66 apart.
 */
import {
  type Area,
  boxOf,
  type Corner,
  cornerAt,
  cornerOf,
  cornersOf,
  covered,
  crossesCell,
  crossesRing,
  fits,
  glued,
  type Hex,
  hexAt,
  nearestFit,
  outlineOf,
  type Part,
  type Piece,
  pieceOf,
  type Tri,
  touching,
  trisOf,
} from "@harmonics/lattice-ui/hexes";
import type { Role, Section } from "./types.ts";

type Pt = { x: number; y: number };

/** Triangles in one bar of each section type. */
export const UNITS: Record<Role, number> = {
  bridge: 1,
  verse: 2,
  prechorus: 3,
  intro: 4,
  outro: 4,
  chorus: 6,
  transition: 1,
  interlude: 2,
  instrumental: 3,
  coda: 4,
  solo: 6,
  postchorus: 2,
};

/**
 * Each section type's colour on the board: the kit's five woods (0–4, a wash), its olive (5, solid),
 * wood 0 solid (6), and white (7). Eight colours for twelve types: the five rarest share white,
 * and which of them a white section is lives in `Layout.roles`.
 */
export const TONE: Record<Role, number> = {
  chorus: 0,
  verse: 1,
  prechorus: 2,
  bridge: 3,
  intro: 4,
  outro: 5,
  solo: 6,
  instrumental: 7,
  interlude: 7,
  transition: 7,
  coda: 7,
  postchorus: 7,
};
const SHARED = 7;
const TONE_ROLE: Role[] = ["chorus", "verse", "prechorus", "bridge", "intro", "outro", "solo", "instrumental"];

/** The board's pieces, and which type each white section is (by piece id). */
export interface Layout {
  pieces: Piece[];
  roles: Record<string, Role>;
}

export const EMPTY: Layout = { pieces: [], roles: {} };

let lastId = 0;
export const newPieceId = () => `piece-${++lastId}`;

// ---- Cells and triangles

const CELL_W = 76.21;
const ROW = 66;
const centreOf = (hex: Hex): Pt => {
  const b = boxOf(hex);
  return { x: b.x + CELL_W / 2, y: b.y + 44 };
};
export const triMid = (t: Tri): Pt => {
  const c = cornersOf(t).map(cornerOf);
  return { x: (c[0]!.x + c[1]!.x + c[2]!.x) / 3, y: (c[0]!.y + c[1]!.y + c[2]!.y) / 3 };
};
/** Directions from a cell's centre to its triangles, in degrees clockwise from the right. */
const LEFT = 180;
/**
 * A cell's six triangles in order round its centre, clockwise from the one facing `start`, so any
 * run of them is one connected shape.
 */
export function around(hex: Hex, start = LEFT): Tri[] {
  const c = centreOf(hex);
  const turn = (t: Tri) => {
    const deg = (Math.atan2(triMid(t).y - c.y, triMid(t).x - c.x) * 180) / Math.PI;
    return (((deg - start) % 360) + 360 + 0.5) % 360;
  };
  return trisOf(hex).sort((a, b) => turn(a) - turn(b));
}
const triKey = (t: Tri) => `${t.i},${t.j},${t.k}`;
const trisOfPart = (p: Part): Tri[] => (p.kind === "cell" ? trisOf(p.at) : [p.at]);
/** A part's corners on the board (a cell's six, a triangle's three), for drawing it. */
export function partPolygon(p: Part): Pt[] {
  if (p.kind === "tri") return cornersOf(p.at).map(cornerOf);
  const b = boxOf(p.at);
  return [
    { x: b.x + CELL_W / 2, y: b.y },
    { x: b.x + CELL_W, y: b.y + 22 },
    { x: b.x + CELL_W, y: b.y + 66 },
    { x: b.x + CELL_W / 2, y: b.y + 88 },
    { x: b.x, y: b.y + 66 },
    { x: b.x, y: b.y + 22 },
  ];
}

// ---- Laying a section out

/** Bars per row of a section: a 4-bar phrase. */
const PER_ROW = 4;

/** The lattice triangles inside a polygon of grid corners. */
function trisInside(poly: Corner[]): Tri[] {
  const pts = poly.map(cornerOf);
  const inside = (m: Pt) => {
    let hit = false;
    for (let a = 0, b = pts.length - 1; a < pts.length; b = a++) {
      const p = pts[a]!;
      const q = pts[b]!;
      if (p.y > m.y !== q.y > m.y && m.x < ((q.x - p.x) * (m.y - p.y)) / (q.y - p.y) + p.x) hit = !hit;
    }
    return hit;
  };
  const is = poly.map((c) => c.i);
  const js = poly.map((c) => c.j);
  const out: Tri[] = [];
  for (let i = Math.min(...is) - 1; i <= Math.max(...is); i++)
    for (let j = Math.min(...js) - 1; j <= Math.max(...js); j++)
      for (const k of [0, 1] as const) if (inside(triMid({ i, j, k }))) out.push({ i, j, k });
  return out;
}

/** A long rhombus (two rhombi end to end) from corner `at`: upright short sides, long sloping ones. */
const longRhombus = (at: Corner): Corner[] => [at, { i: at.i, j: at.j + 2 }, { i: at.i + 1, j: at.j + 2 }, { i: at.i + 1, j: at.j }];

/** A cell's upper-left corner, where a shaped section anchored at that cell starts. */
const cornerOfCell = (hex: Hex): Corner => {
  const b = boxOf(hex);
  return cornerAt(b.x, b.y + 22);
};

/** The widest row for `cells` cells: a phrase (4) at least, and about twice as wide as tall. */
const widthFor = (cells: number) => Math.max(PER_ROW, Math.ceil(Math.sqrt(2 * cells)));

/**
 * The calmest rows for `cells` cells at most `width` to a row: each row centred on the one above,
 * so rows that differ by one cell line up exactly (the lattice's rows sit half a cell apart).
 * Rows widen then narrow, never the other way (a pyramid, a hexagon, a lozenge), and the choice
 * favours fewer rows, the same shape upside down (a palindrome), and no two rows alike (which
 * can't be centred, so they zigzag).
 */
export function rowsFor(cells: number, width: number): number[] {
  if (cells <= width) return [cells];
  const most = Math.ceil(cells / width) + 3;
  let best: { rows: number[]; score: number } | null = null;
  const walk = (rows: number[], sum: number, falling: boolean) => {
    if (sum === cells) {
      const same = rows.slice(1).filter((n, k) => n === rows[k]).length;
      // Two rows alike can't be centred on each other, so a shape with them isn't truly mirrored.
      const mirrored = same === 0 && rows.every((n, k) => n === rows[rows.length - 1 - k]);
      const score = 1.6 * rows.length + (mirrored ? 0 : 1.5) + 2 * same;
      if (!best || score < best.score) best = { rows, score };
      return;
    }
    if (rows.length >= most || sum + (most - rows.length) * width < cells) return;
    const last = rows.at(-1);
    const nexts = last === undefined ? Array.from({ length: width }, (_, k) => k + 1) : [last + 1, last, last - 1];
    for (const next of nexts) {
      if (next < 1 || next > width || sum + next > cells || (falling && last !== undefined && next > last)) continue;
      walk([...rows, next], sum + next, falling || (last !== undefined && next < last));
    }
  };
  walk([], 0, false);
  return best ? (best as { rows: number[] }).rows : Array.from({ length: Math.ceil(cells / width) }, (_, k) => Math.min(width, cells - k * width));
}

/** Where each row's cells go, from the top row's first cell `at`, each row centred on the last. */
function cellsInRows(rows: number[], at: Hex): Hex[][] {
  let q = at.q;
  return rows.map((n, k) => {
    if (k > 0) {
      const diff = n - rows[k - 1]!;
      // A row below sits half a cell right of the same q: one cell wider starts a cell left (half
      // a cell out); one narrower starts at the same q (half a cell in); the same width zigzags.
      q = diff > 0 ? q - 1 : diff < 0 ? q : k % 2 === 1 ? q : q - 1;
    }
    const r = at.r + k;
    return Array.from({ length: n }, (_, c) => ({ q: q + c, r }));
  });
}

/** The triangle of a cell facing `deg` (degrees clockwise from the right). */
const facing = (hex: Hex, deg: number) => around(hex, deg - 30)[0]!;
const RIGHT = 0;

/** A big right-pointing triangle (four small ones) from a cell's upper-left corner. */
const bigTriangle = (hex: Hex): Tri[] => {
  const a = cornerOfCell(hex);
  return trisInside([a, { i: a.i + 2, j: a.j }, { i: a.i, j: a.j + 2 }]);
};

/**
 * A section's bars in its canonical layout from cell `at`, each bar its own parts, in bar order:
 * as symmetrical as the lattice allows.
 *
 * A chorus is its cells in the calmest rows (see `rowsFor`). Every other type is its triangles:
 * as many whole cells as they fill, in the same rows, and the few left over put evenly on the
 * widest row — a triangle at each end (two left over), half a cell at one end (three), a triangle
 * at one end (one); four or five left over make one more cell with its end triangles taken off
 * (both ends, or one). A section smaller than a cell is a simple shape: a triangle, a diamond (two
 * triangles face to face), half a cell, a big triangle, a cell less one. One outro bar is a long rhombus.
 */
export function barsParts(role: Role, bars: number, at: Hex): Part[][] {
  // Nothing reaches left of the cell it starts from (a left end cap, a wider row below would):
  // laid out from a cell further right until it doesn't, so a section at the board's edge stays on it.
  const left = boxOf(at).x;
  for (let dq = 0; dq < 4; dq++) {
    const bars_ = laidOut(role, bars, { q: at.q + dq, r: at.r });
    const xs = bars_.flat().flatMap((p) => partPolygon(p).map((c) => c.x));
    if (Math.min(...xs) >= left - 1e-6) return bars_;
  }
  return laidOut(role, bars, at);
}

/** Whether two triangles share a side. */
const sideBySide = (a: Tri, b: Tri) => {
  const ca = new Set(cornersOf(a).map((c) => `${c.i},${c.j}`));
  return cornersOf(b).filter((c) => ca.has(`${c.i},${c.j}`)).length === 2;
};

/** How well `group` is the bar shape its type is drawn as (lower is better). */
function shapeScore(group: Tri[], role: Role): number {
  const mids = group.map(triMid);
  const spread = Math.max(...mids.flatMap((a) => mids.map((b) => Math.hypot(a.x - b.x, a.y - b.y))));
  if (group.length === 4) {
    // An intro (or coda) bar is a big triangle: one triangle touching the three others.
    const big = group.some((t) => group.filter((u) => u !== t && sideBySide(t, u)).length === 3);
    // An outro bar is a long rhombus: the straightest run of four.
    if (role === "outro") return -spread;
    return big ? 0 : 1;
  }
  // Otherwise as compact as can be (two triangles are always a diamond, three a trapezoid).
  return spread;
}

const barCache = new Map<string, Tri[][] | null>();

/**
 * Triangles split into bars of `unit` that each touch all through, in the bar's own shape where
 * it can be: a diamond, a trapezoid, a big triangle, a long rhombus. Bars run in reading order,
 * each started from the topmost, leftmost triangle left, and the split always leaves the rest
 * dividable into whole bars. Null if it can't be done.
 */
export function splitIntoBars(tris: Tri[], unit: number, role: Role): Tri[][] | null {
  if (unit === 1) return tris.map((t) => [t]);
  const key = `${role}:${tris.map(triKey).sort().join(";")}`;
  if (barCache.has(key)) return barCache.get(key)!;
  const sorted = tris.slice().sort((a, b) => triMid(a).y - triMid(b).y || triMid(a).x - triMid(b).x);
  const near = new Map(sorted.map((t) => [triKey(t), sorted.filter((u) => u !== t && sideBySide(t, u))]));
  const left = new Set(sorted.map(triKey));
  /** Whether what's left falls into groups that are each a whole number of bars. */
  const divisible = () => {
    const seen = new Set<string>();
    for (const start of left) {
      if (seen.has(start)) continue;
      let size = 0;
      const stack = [start];
      seen.add(start);
      while (stack.length) {
        const k = stack.pop()!;
        size++;
        for (const u of near.get(k)!) {
          const uk = triKey(u);
          if (left.has(uk) && !seen.has(uk)) {
            seen.add(uk);
            stack.push(uk);
          }
        }
      }
      if (size % unit !== 0) return false;
    }
    return true;
  };
  const out: Tri[][] = [];
  const solve = (): boolean => {
    const first = sorted.find((t) => left.has(triKey(t)));
    if (!first) return true;
    // Every connected run of `unit` triangles through `first`, best shaped first.
    const groups = new Map<string, Tri[]>();
    const grow = (group: Tri[]) => {
      if (group.length === unit) {
        groups.set(group.map(triKey).sort().join(";"), group);
        return;
      }
      for (const t of group)
        for (const u of near.get(triKey(t))!) if (left.has(triKey(u)) && !group.includes(u)) grow([...group, u]);
    };
    grow([first]);
    const ranked = [...groups.values()].sort((a, b) => shapeScore(a, role) - shapeScore(b, role));
    for (const group of ranked) {
      for (const t of group) left.delete(triKey(t));
      if (divisible()) {
        out.push(group);
        if (solve()) return true;
        out.pop();
      }
      for (const t of group) left.add(triKey(t));
    }
    return false;
  };
  const result = solve() ? out : null;
  barCache.set(key, result);
  return result;
}

/**
 * The most compact convex shape of exactly `total` triangles, as symmetrical as can be: a big
 * right-pointing triangle of side `n` with its two left corners cut off by `x` each and its tip by
 * `z` (every convex shape on the lattice is a big triangle with its corners cut). Cutting the two
 * left corners alike makes it mirror top to bottom; when the tip's cut leaves its right side as
 * long as its left (`z = n − 2x`), it mirrors left to right too, a hexagon like a cell. Fewest
 * sides round the outside wins, both mirrors counting for a little more. Null if no such shape
 * has exactly that many triangles.
 */
export function convexShape(total: number): { n: number; x: number; z: number } | null {
  let best: { n: number; x: number; z: number; score: number } | null = null;
  for (let n = 1; n * n <= 4 * total + 64 && n <= 40; n++)
    for (let x = 0; 2 * x <= n; x++)
      for (let z = 0; z <= n - 2 * x; z++) {
        if (n * n - 2 * x * x - z * z !== total) continue;
        const around = 3 * n - 2 * x - z;
        const score = around + (z === n - 2 * x ? 0 : 1.5);
        if (!best || score < best.score) best = { n, x, z, score };
      }
  return best && { n: best.n, x: best.x, z: best.z };
}

/** The triangles of `convexShape`'s shape, its top-left corner at `a`, in rows top to bottom. */
function convexTris(a: Corner, { n, x, z }: { n: number; x: number; z: number }): Tri[] {
  const { i, j } = a;
  const poly: Corner[] = [
    { i: i + x, j },
    { i: i + n - x, j },
    { i: i + n - x, j: j + x },
    { i: i + z, j: j + n - z },
    { i, j: j + n - z },
    { i, j: j + x },
  ];
  return trisInside(poly).sort((p, q) => triMid(p).y - triMid(q).y || triMid(p).x - triMid(q).x);
}

function laidOut(role: Role, bars: number, at: Hex): Part[][] {
  const unit = UNITS[role];
  const tone = TONE[role];
  const tri = (t: Tri): Part => ({ kind: "tri", at: t, tone });
  if (unit === 6) return cellsInRows(rowsFor(bars, widthFor(bars)), at).flat().map((hex) => [{ kind: "cell", at: hex, tone }]);
  // Each bar one connected piece in its own shape; counted off in order only if that can't be done.
  const chunk = (tris: Tri[]) =>
    (splitIntoBars(tris, unit, role) ?? Array.from({ length: Math.ceil(tris.length / unit) }, (_, n) => tris.slice(n * unit, n * unit + unit))).map((bar) => bar.map(tri));
  if (role === "outro" && bars === 1) {
    const a = cornerOfCell(at);
    return [trisInside(longRhombus(a)).map(tri)];
  }
  // An intro (and a coda) bar is a big triangle, so the section is the calm convex shape of that
  // many triangles drawn twice the size: each of its triangles one big-triangle bar.
  if (role === "intro" || role === "coda") {
    const shape = convexShape(bars);
    if (shape) {
      const small = convexTris({ i: 0, j: 0 }, shape);
      const big = (dI: number, dJ: number) =>
        small.map((t) => trisInside(cornersOf(t).map((c) => ({ i: 2 * c.i + dI, j: 2 * c.j + dJ }))));
      // Lifted level with the top of the cell it starts from, and not left of it, as the others are.
      const box = boxOf(at);
      const base = cornerOfCell(at);
      let best: { bars: Tri[][]; off: number } | null = null;
      for (let di = -6; di <= 2; di++)
        for (let dj = -2; dj <= 4; dj++) {
          const bars_ = big(base.i + di, base.j + dj);
          const pts = bars_.flat().flatMap((t) => cornersOf(t).map(cornerOf));
          const top = Math.min(...pts.map((c) => c.y)) - box.y;
          const left = Math.min(...pts.map((c) => c.x)) - box.x;
          if (top < -1e-6 || left < -1e-6) continue;
          const off = top * 10 + left;
          if (!best || off < best.off) best = { bars: bars_, off };
        }
      if (best) return best.bars.map((bar) => bar.map(tri));
    }
  }
  const total = bars * unit;
  // A convex shape with exactly this many triangles, if there is one: a diamond, a hexagon, a big
  // triangle, a trapezoid; rows of cells with caps otherwise.
  // A shape symmetric only top to bottom (a trapezoid, a big triangle) gives way to whole cells
  // in a row when the triangles make whole cells: those are symmetric both ways.
  const shape = convexShape(total);
  const bothWays = shape && shape.z === shape.n - 2 * shape.x;
  // A big triangle of four can't be two connected bars of two: a 2-bar verse is two diamonds end
  // to end, a long rhombus, so each bar lights whole.
  if (total === 4 && unit === 2) return chunk(trisInside(longRhombus(cornerOfCell(at))));
  if (shape && (bothWays || total % 6 !== 0)) {
    // Its top level with the top of the cell it starts from (as a chorus's would be), and not left
    // of it: the nearest lattice step up and along that does it, so labels in a row line up.
    const box = boxOf(at);
    const base = cornerOfCell(at);
    let best: { tris: Tri[]; off: number } | null = null;
    for (let di = -3; di <= 0; di++)
      for (let dj = 0; dj <= 3; dj++) {
        const tris = convexTris({ i: base.i + di, j: base.j + dj }, shape);
        const pts = tris.flatMap((t) => cornersOf(t).map(cornerOf));
        const top = Math.min(...pts.map((c) => c.y)) - box.y;
        const left = Math.min(...pts.map((c) => c.x)) - box.x;
        if (top < -1e-6 || left < -1e-6) continue;
        const off = top * 10 + left;
        if (!best || off < best.off) best = { tris, off };
      }
    return chunk(best ? best.tris : convexTris(base, shape));
  }
  const beside = (hex: Hex, dq: number): Hex => ({ q: hex.q + dq, r: hex.r });
  if (total < 6) {
    const small: Record<number, Tri[]> = {
      1: [facing(at, RIGHT)],
      2: [facing(at, RIGHT), facing(beside(at, 1), LEFT)],
      3: around(at, 90).slice(0, 3),
      4: bigTriangle(at),
      5: around(at, 30).slice(0, 5),
    };
    return chunk(small[total]!);
  }
  const left = total % 6;
  // Four or five left over: one more cell, less its end triangles.
  const cells = Math.floor(total / 6) + (left >= 4 ? 1 : 0);
  const rows = cellsInRows(rowsFor(cells, widthFor(cells)), at);
  // The widest row, the middle one of those if there are several (the centre of a mirrored shape).
  const widest = Math.max(...rows.map((r) => r.length));
  const candidates = rows.map((r, k) => (r.length === widest ? k : -1)).filter((k) => k >= 0);
  const row = rows[candidates[Math.floor((candidates.length - 1) / 2)]!]!;
  const first = row[0]!;
  const last = row.at(-1)!;
  const taken = new Set<string>();
  if (left === 4) [facing(first, LEFT), facing(last, RIGHT)].forEach((t) => taken.add(triKey(t)));
  if (left === 5) taken.add(triKey(facing(last, RIGHT)));
  const body = rows.flat().flatMap((hex) => around(hex)).filter((t) => !taken.has(triKey(t)));
  const caps =
    left === 1
      ? [facing(beside(last, 1), LEFT)]
      : left === 2
        ? [facing(beside(first, -1), RIGHT), facing(beside(last, 1), LEFT)]
        : left === 3
          ? around(beside(last, 1), 90).slice(0, 3)
          : [];
  return chunk([...body, ...caps]);
}

/** A section's parts in its canonical layout from cell `at` (see `barsParts`). */
export const sectionParts = (role: Role, bars: number, at: Hex): Part[] => barsParts(role, bars, at).flat();


// ---- Reading the song back

/** One section on the board: its type, its bars, and where it is. */
export interface BoardSection {
  role: Role;
  bars: number;
  /** Whether its triangles make whole bars. */
  whole: boolean;
  pieceId: string;
  parts: Part[];
  /** Its box on the board. */
  box: { left: number; top: number; right: number; bottom: number };
}

/**
 * How far right a section reaches when `flow` starts a row with it, in pixels at scale 1: laid out
 * on an odd row, which starts half a cell in, so it holds on either.
 */
export const reachOf = (role: Role, bars: number): number => boxOfTris(sectionParts(role, bars, { q: 0, r: 1 }).flatMap(trisOfPart)).right;

const boxOfTris = (tris: Tri[]) => {
  const pts = tris.flatMap((t) => cornersOf(t).map(cornerOf));
  return {
    left: Math.min(...pts.map((p) => p.x)),
    top: Math.min(...pts.map((p) => p.y)),
    right: Math.max(...pts.map((p) => p.x)),
    bottom: Math.max(...pts.map((p) => p.y)),
  };
};

/** The sections in one piece: its parts of one colour that touch. */
function sectionsIn(piece: Piece, roles: Record<string, Role>): BoardSection[] {
  const out: BoardSection[] = [];
  const byTone = new Map<number, Part[]>();
  for (const p of piece.parts) byTone.set(p.tone, [...(byTone.get(p.tone) ?? []), p]);
  for (const [tone, parts] of byTone) {
    const seen = new Set<number>();
    parts.forEach((_, start) => {
      if (seen.has(start)) return;
      const group = [start];
      seen.add(start);
      for (let n = 0; n < group.length; n++) {
        const a = pieceOf("a", [parts[group[n]!]!]);
        parts.forEach((p, k) => {
          if (!seen.has(k) && touching(a, pieceOf("b", [p]))) {
            seen.add(k);
            group.push(k);
          }
        });
      }
      const mine = group.map((k) => parts[k]!);
      const role = tone === SHARED ? (roles[piece.id] ?? "instrumental") : (TONE_ROLE[tone] ?? "chorus");
      const tris = mine.flatMap(trisOfPart).length;
      const bars = tris / UNITS[role];
      out.push({ role, bars, whole: Number.isInteger(bars), pieceId: piece.id, parts: mine, box: boxOfTris(mine.flatMap(trisOfPart)) });
    });
  }
  return out;
}

/** Sections in reading order: rows top to bottom (a section joins a row if it starts before the row ends), then left to right. */
export function readingOrder(sections: BoardSection[]): BoardSection[] {
  const sorted = sections.slice().sort((a, b) => a.box.top - b.box.top);
  const rows: { bottom: number; items: BoardSection[] }[] = [];
  for (const s of sorted) {
    const row = rows.find((r) => s.box.top < r.bottom - 13);
    if (row) {
      row.items.push(s);
      row.bottom = Math.max(row.bottom, s.box.bottom);
    } else rows.push({ bottom: s.box.bottom, items: [s] });
  }
  return rows.flatMap((r) => r.items.sort((a, b) => a.box.left - b.box.left));
}

/** The song the board spells, its sections in reading order, and whether every bar is whole. */
export function songOf(layout: Layout): { sections: Section[]; order: BoardSection[]; whole: boolean } {
  const order = readingOrder(layout.pieces.flatMap((p) => sectionsIn(p, layout.roles)));
  return {
    sections: order.map((s) => ({ role: s.role, bars: Math.max(1, Math.round(s.bars)), intentional: false })),
    order,
    whole: order.every((s) => s.whole && s.bars > 0),
  };
}

/**
 * A section's bars, each its own parts, in bar order. As laid out, each bar is known exactly; once
 * rearranged by hand, bars are counted off in order: cells row by row, triangles round each cell.
 */
export function barPartsOf(section: BoardSection): Part[][] {
  const unit = UNITS[section.role];
  if (section.whole) {
    const canonical = barsParts(section.role, section.bars, anchorOf(section));
    if (sameParts(canonical.flat(), section.parts)) return canonical.map((bar) => bar.map((p) => section.parts.find((x) => partKey(x) === partKey(p)) ?? p));
  }
  if (unit === 6 && section.parts.every((p) => p.kind === "cell"))
    return section.parts
      .slice()
      .sort((a, b) => (a.at as Hex).r - (b.at as Hex).r || (a.at as Hex).q - (b.at as Hex).q)
      .map((p) => [p]);
  const cellOf = (t: Tri) => hexAt(triMid(t).x, triMid(t).y);
  const tris = section.parts.flatMap((p) => trisOfPart(p).map((t) => ({ t, hex: cellOf(t), tone: p.tone })));
  const order = new Map<string, number>();
  for (const { hex } of tris) around(hex).forEach((t, n) => order.set(triKey(t), n));
  tris.sort((a, b) => a.hex.r - b.hex.r || a.hex.q - b.hex.q || order.get(triKey(a.t))! - order.get(triKey(b.t))!);
  const tone = tris[0]?.tone ?? 0;
  const split = section.whole ? splitIntoBars(tris.map(({ t }) => t), unit, section.role) : null;
  if (split) return split.map((bar) => bar.map((t) => ({ kind: "tri", at: t, tone })));
  const out: Part[][] = [];
  for (let n = 0; n < tris.length; n += unit) out.push(tris.slice(n, n + unit).map(({ t, tone }) => ({ kind: "tri", at: t, tone })));
  return out;
}

/** Where each bar of a section is, in bar order, as corners on the board. */
export const barsOf = (section: BoardSection): Pt[][] => barPartsOf(section).map((bar) => bar.flatMap(partPolygon));

/** A section's outer edge, as sides on the board. */
export const outlineOfSection = (s: BoardSection) => outlineOf(pieceOf("outline", s.parts));

/** The cell a section's layout starts from: the left of its top row. */
function anchorOf(s: BoardSection): Hex {
  const cellOf = (p: Part): Hex => (p.kind === "cell" ? p.at : hexAt(triMid(p.at).x, triMid(p.at).y));
  const hexes = s.parts.map(cellOf);
  // The cell its canonical layout starts from, if it still stands as laid out: the top row's first
  // cell, tried among the cells it covers and their neighbours (caps and small shapes reach past it).
  const r = Math.min(...hexes.map((h) => h.r));
  const seen = new Set<string>();
  for (const h of hexes.filter((x) => x.r <= r + 1))
    for (const c of [h, { q: h.q - 1, r: h.r }, { q: h.q + 1, r: h.r }, { q: h.q, r: h.r - 1 }, { q: h.q + 1, r: h.r - 1 }]) {
      const key = `${c.q},${c.r}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (s.whole && sameParts(sectionParts(s.role, Math.round(s.bars), c), s.parts)) return c;
    }
  const top = hexes.filter((h) => h.r === r);
  return { q: Math.min(...top.map((h) => h.q)), r };
}

const partKey = (p: Part) => (p.kind === "cell" ? `c${p.at.q},${p.at.r}` : `t${triKey(p.at)}`);
const sameParts = (a: Part[], b: Part[]) => {
  const key = (p: Part) => (p.kind === "cell" ? `c${p.at.q},${p.at.r}` : `t${triKey(p.at)}`);
  const ka = new Set(a.map(key));
  return a.length === b.length && b.every((p) => ka.has(key(p)));
};

// ---- Laying the whole song out

/** The board's area for `width` pixels at scale 1, as deep as anything could go. */
export const areaOf = (width: number): Area => ({ left: 0, top: 0, right: width, bottom: 100000 });

/**
 * The song laid out like wrapped text, `width` pixels wide at scale 1: each section in its
 * canonical layout, left to right with a cell between, wrapping to a new row (with a row between,
 * for the labels) when it would pass the edge.
 */
export function flow(sections: Section[], width: number): Layout {
  const pieces: Piece[] = [];
  const roles: Record<string, Role> = {};
  // A row's first cell, at the left edge: each row down shifts the cells half a cell right, so
  // q = 0 would start every new row further right, until rows ran off the edge.
  const rowStart = (row: number) => -Math.floor(row / 2);
  let q = 0;
  let r = 0;
  let rowBottom = 0;
  for (const s of sections) {
    let parts = sectionParts(s.role, s.bars, { q, r });
    let box = boxOfTris(parts.flatMap(trisOfPart));
    if (q > rowStart(r) && box.right > width) {
      r = rowBottom + 2;
      q = rowStart(r);
      parts = sectionParts(s.role, s.bars, { q, r });
      box = boxOfTris(parts.flatMap(trisOfPart));
    }
    const id = newPieceId();
    pieces.push(pieceOf(id, parts));
    if (TONE[s.role] === SHARED) roles[id] = s.role;
    // The section's lowest row of cells once its last phrase is finished (a long one has two
    // phrases to a row), so the next row leaves its ghost room to show.
    const finished = sectionParts(s.role, Math.ceil(s.bars / PER_ROW) * PER_ROW, { q, r });
    const lowest = Math.max(...finished.map((x) => (x.kind === "cell" ? x.at.r : hexAt(triMid(x.at).x, triMid(x.at).y).r)));
    rowBottom = Math.max(rowBottom, lowest);
    // The next section starts a cell clear of this one's right edge, on this row.
    q = Math.ceil(box.right / CELL_W - r / 2 + 1e-6) + 1;
  }
  return { pieces, roles };
}

/** A section's parts replaced (or removed, with none), keeping everything else where it is. */
function replaced(layout: Layout, s: BoardSection, parts: Part[]): Layout {
  const pieces = layout.pieces.flatMap((p) => {
    if (p.id !== s.pieceId) return [p];
    const rest = p.parts.filter((x) => !s.parts.includes(x));
    const next = [...rest, ...parts];
    return next.length ? [pieceOf(p.id, next)] : [];
  });
  const roles = { ...layout.roles };
  if (!pieces.some((p) => p.id === s.pieceId)) delete roles[s.pieceId];
  return { pieces, roles };
}

/**
 * Section `index` (in reading order) at `bars` bars, laid out again from where it starts; null if
 * it would no longer fit (off the board, or on another piece). Laid out canonically, so a section
 * the player has arranged by hand comes back in rows.
 */
export function withBars(layout: Layout, index: number, bars: number, width: number): Layout | null {
  const s = songOf(layout).order[index];
  if (!s) return null;
  if (bars <= 0) return replaced(layout, s, []);
  const parts = sectionParts(s.role, bars, anchorOf(s));
  const next = replaced(layout, s, parts);
  const piece = next.pieces.find((p) => p.id === s.pieceId)!;
  const others = next.pieces.filter((p) => p.id !== s.pieceId);
  return fits(piece, others, areaOf(width)) && noSelfOverlap(piece) ? next : null;
}

const noSelfOverlap = (piece: Piece) => {
  const tris = covered(piece).map(triKey);
  return new Set(tris).size === tris.length;
};

/**
 * The song changed off the board (typed, a fix, a preset, an undo of the chart): if it has the same
 * sections in the same order, each changed one is laid out again where it is; otherwise, or if
 * that doesn't fit, the whole song is laid out afresh.
 */
export function sync(layout: Layout, next: Section[], width: number): Layout {
  const { order } = songOf(layout);
  const same = order.length === next.length && order.every((s, i) => s.role === next[i]!.role);
  if (!same) return flow(next, width);
  let out: Layout = layout;
  for (let i = 0; i < next.length; i++) {
    if (Math.round(order[i]!.bars) === next[i]!.bars) continue;
    const changed = withBars(out, i, next[i]!.bars, width);
    if (!changed) return flow(next, width);
    out = changed;
  }
  return out;
}

/**
 * Where a short section's last phrase would finish: the parts its finished layout (a whole number
 * of phrases, laid out from the same cell) covers that it doesn't yet, when it still stands as laid
 * out and the finished section has room. Its shape may change as it fills: a 7-bar chorus is 4
 * cells over 3, an 8-bar one 4 over 4. Empty otherwise.
 */
export function ghostsOf(layout: Layout, index: number, width: number): Part[] {
  return finishing(layout, index, width)?.extra ?? [];
}

/** The section finished to a whole number of phrases, as its ghost shows it; null if it can't be. */
export function finishPhrase(layout: Layout, index: number, width: number): Layout | null {
  const f = finishing(layout, index, width);
  const s = songOf(layout).order[index];
  return f && s ? replaced(layout, s, f.parts) : null;
}

function finishing(layout: Layout, index: number, width: number): { parts: Part[]; extra: Part[] } | null {
  const s = songOf(layout).order[index];
  if (!s || !s.whole || s.bars % PER_ROW === 0) return null;
  const at = anchorOf(s);
  if (!sameParts(s.parts, sectionParts(s.role, s.bars, at))) return null;
  const others = layout.pieces.map((p) => (p.id === s.pieceId ? pieceOf(p.id, p.parts.filter((x) => !s.parts.includes(x))) : p)).filter((p) => p.parts.length);
  const key = (p: Part) => (p.kind === "cell" ? `c${p.at.q},${p.at.r}` : `t${triKey(p.at)}`);
  // A cell of the section counts as its six triangles, and the other way round.
  const mine = new Set(s.parts.flatMap((p) => (p.kind === "cell" ? [key(p), ...trisOf(p.at).map((t) => `t${triKey(t)}`)] : [key(p)])));
  const bars = Math.ceil(s.bars / PER_ROW) * PER_ROW;
  // From the same cell or one beside it: whichever keeps most of what is there already.
  let best: { parts: Part[]; extra: Part[] } | null = null;
  for (const c of [at, { q: at.q - 1, r: at.r }, { q: at.q + 1, r: at.r }]) {
    const parts = sectionParts(s.role, bars, c);
    if (!fits(pieceOf("finished", parts), others, areaOf(width))) continue;
    const extra = parts.filter((p) => !mine.has(key(p)));
    if (!best || extra.length < best.extra.length) best = { parts, extra };
  }
  return best;
}

/** Parts split into the groups of them that touch. */
export function connected(parts: Part[]): Part[][] {
  const seen = new Set<number>();
  const out: Part[][] = [];
  parts.forEach((_, start) => {
    if (seen.has(start)) return;
    const group = [start];
    seen.add(start);
    for (let n = 0; n < group.length; n++) {
      const a = pieceOf("a", [parts[group[n]!]!]);
      parts.forEach((p, k) => {
        if (!seen.has(k) && touching(a, pieceOf("b", [p]))) {
          seen.add(k);
          group.push(k);
        }
      });
    }
    out.push(group.map((k) => parts[k]!));
  });
  return out;
}

/**
 * The board pulled one part off a piece (Alt-drag), and a part is one triangle: the whole bar that
 * triangle belongs to, pulled off instead, moved as the triangle was. `before` is the layout the
 * pull started from, `after` the board's pieces once it was let go, `pulledId` the pulled piece.
 * Null when there is nothing to change (a whole cell, already a bar), the triangle was turned while
 * carried, or the bar has no room where it was let go.
 */
export function pullBar(before: Layout, after: Piece[], pulledId: string, width: number, tidy = false): Layout | null {
  const pulled = after.find((p) => p.id === pulledId);
  const moved = pulled?.parts.length === 1 && pulled.parts[0]!.kind === "tri" ? pulled.parts[0]!.at as Tri : null;
  if (!moved) return null;
  // Where it came from: the one triangle the board had before and has nowhere now.
  const now = new Set(after.filter((p) => p.id !== pulledId).flatMap((p) => p.parts.flatMap(trisOfPart).map(triKey)));
  const gone = before.pieces.flatMap((p) => p.parts.flatMap(trisOfPart)).filter((t) => !now.has(triKey(t)));
  if (gone.length !== 1 || gone[0]!.k !== moved.k) return null;
  const from = gone[0]!;
  const has = (p: Part, key: string) => trisOfPart(p).some((t) => triKey(t) === key);
  const section = songOf(before).order.find((s) => s.parts.some((p) => has(p, triKey(from))));
  if (!section) return null;
  const step = { i: moved.i - from.i, j: moved.j - from.j };
  const source = before.pieces.find((p) => p.id === section.pieceId)!;
  const others = before.pieces.filter((p) => p.id !== source.id);
  const tone = section.parts[0]!.tone;
  const mine = section.parts.flatMap(trisOfPart);

  /** The layout with `bar` (triangle keys) pulled off and moved, or null if that doesn't work. */
  const attempt = (bar: Set<string>): Layout | null => {
    const piece = pieceOf(
      pulledId,
      mine.filter((t) => bar.has(triKey(t))).map((t) => ({ kind: "tri" as const, at: { i: t.i + step.i, j: t.j + step.j, k: t.k }, tone })),
    );
    // What stays behind, as as many pieces as it now falls into.
    const rest = source.parts.flatMap((p): Part[] =>
      p.kind === "cell" && trisOf(p.at).some((t) => bar.has(triKey(t)))
        ? trisOf(p.at).filter((t) => !bar.has(triKey(t))).map((t) => ({ kind: "tri", at: t, tone: p.tone }))
        : p.kind === "tri" && bar.has(triKey(p.at))
          ? []
          : [p],
    );
    const left = connected(rest).map((parts, n) => pieceOf(n === 0 ? source.id : newPieceId(), parts));
    if (!fits(piece, [...others, ...left], areaOf(width))) return null;
    const roles = { ...before.roles };
    if (roles[source.id]) for (const p of [piece, ...left.slice(1)]) roles[p.id] = roles[source.id]!;
    const next: Layout = { pieces: [...others, ...left, piece], roles };
    return songOf(next).whole ? next : null;
  };
  /** How many pieces the section is left in: one is best (it stays one section). */
  const pieces = (next: Layout) => next.pieces.length - before.pieces.length;

  // The bar as laid out first; then any bar-sized run of the section's triangles through the one
  // pulled (for 2 or 3 triangles the only shapes are a diamond and half a cell) that leaves the
  // rest in whole bars.
  const unit = UNITS[section.role];
  const laidOut = barPartsOf(section).find((b) => b.some((p) => has(p, triKey(from))));
  const candidates: Set<string>[] = laidOut ? [new Set(laidOut.flatMap(trisOfPart).map(triKey))] : [];
  const pool = new Map(mine.map((t) => [triKey(t), t]));
  const grow = (group: string[]) => {
    if (group.length === unit) return candidates.push(new Set(group));
    for (const key of group)
      for (const [k2, t2] of pool)
        if (!group.includes(k2) && touching(pieceOf("a", [{ kind: "tri", at: pool.get(key)!, tone }]), pieceOf("b", [{ kind: "tri", at: t2, tone }])))
          grow([...group, k2]);
  };
  grow([triKey(from)]);
  // Of the bars that work, the one that leaves the rest of the section in fewest pieces, then
  // the one most like the bar's own shape (a big triangle for an intro, a long rhombus for an
  // outro); the bar as laid out wins a tie.
  const tried = new Set<string>();
  let best: { next: Layout; rank: number } | null = null;
  for (const bar of candidates) {
    const id = [...bar].sort().join("|");
    if (tried.has(id)) continue;
    tried.add(id);
    const next = attempt(bar);
    if (!next) continue;
    const rank = pieces(next) * 1000 + shapeScore(mine.filter((t) => bar.has(triKey(t))), section.role);
    if (!best || rank < best.rank) best = { next, rank };
  }
  if (!best) return null;
  // What stays behind laid out again where it stands, in its proper shape (an intro of 3 a big
  // trapezoid, not the L a bar out of its middle would leave).
  return tidy ? tidySection(best.next, source.id, tone, width) : best.next;
}

/**
 * The section of colour `tone` in piece `pieceId` laid out again, where it stands, in its proper
 * shape; the layout unchanged if it isn't there or the new shape has no room.
 */
export function tidySection(layout: Layout, pieceId: string, tone: number, width: number): Layout {
  const order = songOf(layout).order;
  const index = order.findIndex((s) => s.pieceId === pieceId && s.parts[0]!.tone === tone);
  if (index < 0) return layout;
  return withBars(layout, index, Math.round(order[index]!.bars), width) ?? layout;
}

/**
 * The bar under a point (board pixels at scale 1) made a piece of its own, where it stands, ready
 * to be carried whole: what Alt-drag should pick up. Null over a chorus (its part is already a
 * bar), over nothing, or if no bar there can come away leaving whole bars.
 */
export function splitBar(
  layout: Layout,
  at: Pt,
  width: number,
): { layout: Layout; barId: string; keys: string[]; sourceId: string; tone: number } | null {
  const cell = hexAt(at.x, at.y);
  const under = trisOf(cell).reduce((best, t) => {
    const m = triMid(t);
    const d = Math.hypot(m.x - at.x, m.y - at.y);
    return d < best.d ? { t, d } : best;
  }, { t: trisOf(cell)[0]!, d: Infinity }).t;
  const key = triKey(under);
  const source = layout.pieces.find((p) => p.parts.some((x) => x.kind === "tri" && triKey(x.at) === key));
  if (!source) return null;
  const part = source.parts.find((x) => x.kind === "tri" && triKey(x.at) === key)!;
  const barId = newPieceId();
  const after = [
    ...layout.pieces.filter((p) => p !== source),
    pieceOf(source.id, source.parts.filter((x) => x !== part)),
    pieceOf(barId, [part]),
  ];
  const split = pullBar(layout, after, barId, width);
  if (!split) return null;
  const bar = split.pieces.find((p) => p.id === barId)!;
  return { layout: split, barId, keys: bar.parts.flatMap(trisOfPart).map(triKey).sort(), sourceId: source.id, tone: part.tone };
}

/** The index (in reading order) of the section with a triangle or cell under a point, or -1. */
export function sectionIndexAt(layout: Layout, at: Pt): number {
  const cell = hexAt(at.x, at.y);
  const under = trisOf(cell).reduce((best, t) => {
    const m = triMid(t);
    const d = Math.hypot(m.x - at.x, m.y - at.y);
    return d < best.d ? { t, d } : best;
  }, { t: trisOf(cell)[0]!, d: Infinity }).t;
  return songOf(layout).order.findIndex((s) =>
    s.parts.some((p) => (p.kind === "cell" ? p.at.q === cell.q && p.at.r === cell.r : triKey(p.at) === triKey(under))),
  );
}

/**
 * One bar taken off section `index`, for a tap rather than a drag: the section one bar shorter,
 * laid out again where it stands, and the bar in its own shape as a section of its own in the
 * nearest free place to its right. Null for a one-bar section, or with no room.
 */
export function pullOneBar(layout: Layout, index: number, width: number): Layout | null {
  const s = songOf(layout).order[index];
  if (!s || Math.round(s.bars) < 2) return null;
  const shorter = withBars(layout, index, Math.round(s.bars) - 1, width);
  if (!shorter) return null;
  const at = hexAt(s.box.right + 50, s.box.top + 44);
  const id = newPieceId();
  let bar: Piece | undefined = pieceOf(id, sectionParts(s.role, 1, at));
  const area = areaOf(width);
  if (!fits(bar, shorter.pieces, area)) bar = nearestFit(bar, shorter.pieces, area);
  if (!bar) return null;
  const roles = { ...shorter.roles };
  if (TONE[s.role] === SHARED) roles[bar.id] = s.role;
  return { pieces: [...shorter.pieces, bar], roles };
}

/** The triangle keys of a piece, sorted: to tell whether a piece ended where it started. */
export const keysOf = (piece: Piece) => piece.parts.flatMap(trisOfPart).map(triKey).sort();

/**
 * One bar of `role` dropped at a point on the board: the run of triangles from the one under the
 * point (or the cell, for a chorus), moved to the nearest place it fits, and glued to a section of
 * the same type it lands against, so it adds a bar to it. Null if there is no room.
 */
export function dropBar(layout: Layout, role: Role, at: Pt, width: number): Layout | null {
  const unit = UNITS[role];
  const tone = TONE[role];
  const hex = hexAt(at.x, at.y);
  let parts: Part[];
  if (unit === 6) parts = [{ kind: "cell", at: hex, tone }];
  // An intro, coda or outro bar has its own shape: a big triangle, a long rhombus.
  else if (role === "intro" || role === "coda" || role === "outro") parts = sectionParts(role, 1, hex);
  else {
    // The run starts at the triangle under the point and goes on clockwise round the cell.
    const c = centreOf(hex);
    const toward = (Math.atan2(at.y - c.y, at.x - c.x) * 180) / Math.PI;
    parts = around(hex, toward - 30)
      .slice(0, unit)
      .map((t) => ({ kind: "tri" as const, at: t, tone }));
  }
  const id = newPieceId();
  let piece: Piece | undefined = pieceOf(id, parts);
  const area = areaOf(width);
  const mine = (p: Piece) => p.parts.some((x) => x.tone === tone) && (tone !== SHARED || layout.roles[p.id] === role);
  const touchesMine = (at: Piece) => layout.pieces.some((p) => mine(p) && touching(at, p));
  // Dropped near a section of its own type, it goes to the nearest place against it, to add a
  // bar; otherwise to the nearest place it fits at all.
  if (!(fits(piece, layout.pieces, area) && touchesMine(piece))) {
    const against = nearestFit(piece, layout.pieces, area, undefined, 2, touchesMine);
    piece = against ?? (fits(piece, layout.pieces, area) ? piece : nearestFit(piece, layout.pieces, area));
  }
  if (!piece) return null;
  // Against a section of its own type, it joins it; against anything else it only sits beside it.
  const own = layout.pieces.filter((p) => mine(p) && touching(piece!, p));
  const { piece: joined, absorbed } = own.length ? glued(piece, own) : { piece, absorbed: [] as string[] };
  const pieces = [...layout.pieces.filter((p) => !absorbed.includes(p.id)), joined];
  const roles = { ...layout.roles };
  for (const gone of absorbed) delete roles[gone];
  if (tone === SHARED) roles[joined.id] = role;
  return { pieces, roles };
}

/** Whether a shears stroke (board pixels at scale 1) goes clean through any part of a section. */
export function cutThrough(stroke: Pt[], s: BoardSection): boolean {
  return s.parts.some((p) => (p.kind === "cell" ? crossesCell(stroke, p.at) : crossesRing(stroke, cornersOf(p.at).map(cornerOf))));
}

/**
 * The white sections' types carried over a change the board made: a piece that kept its id keeps
 * its type; a new piece (glued, broken, pulled apart) takes the type of a white piece that went.
 */
export function carryRoles(before: Layout, pieces: Piece[]): Record<string, Role> {
  const roles: Record<string, Role> = {};
  const ids = new Set(pieces.map((p) => p.id));
  const gone = Object.entries(before.roles).filter(([id]) => !ids.has(id)).map(([, role]) => role);
  for (const p of pieces) {
    if (!p.parts.some((x) => x.tone === SHARED)) continue;
    roles[p.id] = before.roles[p.id] ?? gone[0] ?? "instrumental";
  }
  return roles;
}

const cornersOfLayout = (layout: Layout) => layout.pieces.flatMap((p) => covered(p).flatMap((t) => cornersOf(t).map(cornerOf)));
/** The right of the rightmost piece, in board pixels at scale 1. */
export const rightOf = (layout: Layout) => Math.max(0, ...cornersOfLayout(layout).map((c) => c.x));

/** The bottom of the lowest piece, in board pixels at scale 1. */
export const bottomOf = (layout: Layout) => Math.max(0, ...cornersOfLayout(layout).map((c) => c.y));

export { ROW, SHARED };
