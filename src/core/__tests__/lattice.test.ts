import { describe, expect, it } from "vitest";
import { boxOf, cornerOf, cornersOf, pieceOf, touching, trisOf } from "@harmonics/lattice-ui/hexes";
import {
  barPartsOf,
  barsOf,
  carryRoles,
  cutThrough,
  dropBar,
  convexShape,
  finishPhrase,
  tidySection,
  flow,
  ghostsOf,
  pullBar,
  type Layout,
  rowsFor,
  sectionParts,
  songOf,
  sync,
  UNITS,
  withBars,
} from "../lattice.ts";
import { format, parse } from "../parse.ts";
import type { Role } from "../types.ts";

const ROLES: Role[] = ["chorus", "verse", "prechorus", "bridge", "intro", "outro", "solo", "instrumental", "interlude", "transition", "coda"];
const song = (text: string) => parse(text).sections;
const read = (layout: Layout) => format(songOf(layout).sections);

describe("laying a section out", () => {
  it("makes every bar a connected run of its type's triangles", () => {
    for (const role of ROLES)
      for (const bars of [1, 3, 4, 7, 8]) {
        const parts = sectionParts(role, bars, { q: 2, r: 2 });
        const tris = parts.reduce((n, p) => n + (p.kind === "cell" ? 6 : 1), 0);
        expect(tris).toBe(bars * UNITS[role]);
        // The whole section is one connected shape.
        const piece = pieceOf("s", parts);
        expect(parts.every((p) => parts.length === 1 || parts.some((o) => o !== p && touching(pieceOf("a", [p]), pieceOf("b", [o]))))).toBe(true);
        expect(piece.parts).toHaveLength(parts.length);
      }
  });

  it("reads every type back at its length", () => {
    for (const role of ROLES)
      for (const bars of [1, 2, 4, 5, 8, 12]) {
        const layout = { pieces: [pieceOf("p", sectionParts(role, bars, { q: 0, r: 0 }))], roles: { p: role } };
        const { sections, whole } = songOf(layout);
        expect(whole).toBe(true);
        expect(sections).toEqual([{ role, bars, intentional: false }]);
      }
  });

  it("gives every bar its own place, in order", () => {
    const layout = flow(song("Vs6"), 2000);
    const bars = barsOf(songOf(layout).order[0]!);
    expect(bars).toHaveLength(6);
    expect(bars.every((b) => b.length === 6)).toBe(true);
  });
});

describe("calm shapes", () => {
  it("centres a section's rows: one row, a pyramid, a hexagon", () => {
    expect(rowsFor(4, 4)).toEqual([4]);
    expect(rowsFor(6, 4)).toEqual([1, 2, 3]);
    expect(rowsFor(7, 4)).toEqual([3, 4]);
    expect(rowsFor(10, 5)).toEqual([3, 4, 3]);
    expect(rowsFor(16, 6)).toEqual([5, 6, 5]);
  });

  it("mirrors a section's leftover triangles: a cell with a triangle at each end", () => {
    const parts = sectionParts("bridge", 8, { q: 2, r: 2 });
    const xs = parts.flatMap((p) => (p.kind === "tri" ? cornersOf(p.at).map((c) => cornerOf(c).x) : []));
    const ys = parts.flatMap((p) => (p.kind === "tri" ? cornersOf(p.at).map((c) => cornerOf(c).y) : []));
    const mid = (v: number[]) => (Math.max(...v) + Math.min(...v)) / 2;
    // Symmetric about its middle both ways: every corner has its mirror image.
    const key = (x: number, y: number) => `${x.toFixed(1)},${y.toFixed(1)}`;
    const corners = new Set(xs.map((x, k) => key(x, ys[k]!)));
    for (let k = 0; k < xs.length; k++) {
      expect(corners.has(key(2 * mid(xs) - xs[k]!, ys[k]!))).toBe(true);
      expect(corners.has(key(xs[k]!, 2 * mid(ys) - ys[k]!))).toBe(true);
    }
  });

  it("keeps a 32-bar section compact", () => {
    for (const role of ["chorus", "verse", "prechorus", "intro", "outro", "bridge"] as const) {
      const parts = sectionParts(role, 32, { q: 0, r: 0 });
      const pts = parts.flatMap((p) =>
        p.kind === "cell" ? [{ x: boxOf(p.at).x, y: boxOf(p.at).y }, { x: boxOf(p.at).x + 76.21, y: boxOf(p.at).y + 88 }] : cornersOf(p.at).map(cornerOf),
      );
      const ys = pts.map((p) => p.y);
      expect(Math.max(...ys) - Math.min(...ys)).toBeLessThanOrEqual(6 * 66 + 88);
    }
  });

  it("has no holes: every type reads back as one section", () => {
    for (const role of ["verse", "prechorus", "bridge", "intro", "outro"] as const)
      for (const bars of [2, 3, 5, 7, 16, 32]) {
        const read = songOf({ pieces: [pieceOf("s", sectionParts(role, bars, { q: 0, r: 0 }))], roles: {} }).sections;
        expect(read).toEqual([{ role, bars, intentional: false }]);
      }
  });
});

describe("room to glue", () => {
  it("leaves a verse a full cell side a chorus can be put flush against", () => {
    const verse = pieceOf("v", sectionParts("verse", 4, { q: 0, r: 0 }));
    const chorus = pieceOf("c", sectionParts("chorus", 1, { q: 0, r: 1 }));
    expect(touching(verse, chorus)).toBe(true);
  });
});

describe("the whole song", () => {
  it("lays a song out and reads the same song back", () => {
    const text = "In4 Vs8 Pre4 Ch8 Vs8 Pre4 Ch8 Br8 Ch8 Ch8 Out4";
    const layout = flow(song(text), 1000);
    expect(read(layout)).toBe(text);
    expect(songOf(layout).whole).toBe(true);
  });

  it("wraps onto new rows within the width", () => {
    const layout = flow(song("Ch8 Ch8 Ch8 Ch8"), 700);
    const right = Math.max(...layout.pieces.flatMap((p) => p.parts.map((x) => (x.kind === "cell" ? boxOf(x.at).x + 76.21 : 0))));
    expect(right).toBeLessThanOrEqual(700);
    expect(read(layout)).toBe("Ch8 Ch8 Ch8 Ch8");
  });

  it("starts the next row of sections just under the tallest section above it", () => {
    const layout = flow(song("Ch32 Ch8 Ch8"), 900);
    const rows = layout.pieces.map((p) => p.parts.map((x) => (x.kind === "cell" ? x.at.r : 0)));
    // The next row of sections starts one empty row below the first's lowest.
    expect(Math.min(...rows[1]!)).toBe(Math.max(...rows[0]!) + 2);
  });

  it("keeps the rare white types apart by name", () => {
    const layout = flow(song("Vs4 Inter2 Tr1 Coda2 Inst4"), 2000);
    expect(read(layout)).toBe("Vs4 Inter2 Tr1 Coda2 Inst4");
  });

  it("changes one section's length in place, leaving the rest where they were", () => {
    const layout = flow(song("Vs8 Ch8 Br8"), 2000);
    const next = sync(layout, song("Vs8 Ch7 Br8"), 2000);
    expect(read(next)).toBe("Vs8 Ch7 Br8");
    expect(next.pieces[0]).toBe(layout.pieces[0]);
    expect(next.pieces.at(-1)).toBe(layout.pieces.at(-1));
  });

  it("lays out afresh when the sections themselves change", () => {
    const layout = flow(song("Vs8 Ch8"), 2000);
    expect(read(sync(layout, song("Ch8 Vs8 Br4"), 2000))).toBe("Ch8 Vs8 Br4");
  });

  it("won't grow a section onto its neighbour", () => {
    const layout = flow(song("Ch4 Ch4"), 2000);
    expect(withBars(layout, 0, 8, 2000)).not.toBeNull();
    // Packed tight: the first chorus has no room to grow.
    const tight: Layout = { pieces: [pieceOf("a", sectionParts("chorus", 4, { q: 0, r: 0 })), pieceOf("b", sectionParts("chorus", 4, { q: 0, r: 1 }))], roles: {} };
    expect(withBars(tight, 0, 8, 2000)).toBeNull();
  });
});

describe("what the board does", () => {
  it("counts part of a bar as not whole, so the change can be refused", () => {
    const parts = sectionParts("verse", 2, { q: 0, r: 0 });
    const layout = { pieces: [pieceOf("p", parts.slice(1))], roles: {} };
    expect(songOf(layout).whole).toBe(false);
  });

  it("adds a dropped bar to a section of its own type it lands against", () => {
    const layout = flow(song("Ch2"), 2000);
    const cell = boxOf({ q: 2, r: 0 });
    const next = dropBar(layout, "chorus", { x: cell.x + 38, y: cell.y + 44 }, 2000)!;
    expect(read(next)).toBe("Ch3");
  });

  it("adds a bar dropped a little way off a section of its own type to it", () => {
    const layout = flow(song("Ch2"), 2000);
    const cell = boxOf({ q: 3, r: 0 });
    expect(read(dropBar(layout, "chorus", { x: cell.x + 38, y: cell.y + 44 }, 2000)!)).toBe("Ch3");
  });

  it("lengthens a section from its label when there is room", () => {
    expect(read(withBars(flow(song("Vs4 Ch4"), 2000), 0, 5, 2000)!)).toBe("Vs5 Ch4");
  });

  it("drops a bar of another type beside, as its own section", () => {
    const layout = flow(song("Ch2"), 2000);
    const cell = boxOf({ q: 2, r: 0 });
    const next = dropBar(layout, "bridge", { x: cell.x + 50, y: cell.y + 30 }, 2000)!;
    expect(read(next)).toBe("Ch2 Br1");
  });

  it("shows where a short section's phrase would finish", () => {
    const layout = flow(song("Ch7 Vs3"), 2000);
    expect(ghostsOf(layout, 0, 2000)).toHaveLength(1);
    // A 3-bar verse is a hexagon, a 4-bar one a big diamond: the ghost shows the diamond's new triangles.
    expect(ghostsOf(layout, 1, 2000).length).toBeGreaterThan(0);
    expect(read(finishPhrase(layout, 1, 2000)!)).toBe("Ch7 Vs4");
    expect(ghostsOf(flow(song("Ch8"), 2000), 0, 2000)).toHaveLength(0);
  });

  it("lays a section's triangles out as a convex shape, symmetric both ways when it can", () => {
    // 16 triangles (an 8-bar verse): a big triangle of side 5, its left corners cut by 2, its tip by 1.
    expect(convexShape(16)).toEqual({ n: 5, x: 2, z: 1 });
    expect(convexShape(6)).toEqual({ n: 3, x: 1, z: 1 });
    expect(convexShape(24)).toEqual({ n: 6, x: 2, z: 2 });
    const parts = sectionParts("verse", 8, { q: 2, r: 2 });
    expect(parts).toHaveLength(16);
    expect(read({ pieces: [pieceOf("v", parts)], roles: {} })).toBe("Vs8");
  });

  it("cuts only sections a stroke goes clean through", () => {
    const layout = flow(song("Ch1"), 2000);
    const s = songOf(layout).order[0]!;
    const b = boxOf({ q: 0, r: 0 });
    expect(cutThrough([{ x: b.x + 38, y: b.y - 10 }, { x: b.x + 38, y: b.y + 100 }], s)).toBe(true);
    expect(cutThrough([{ x: b.x + 30, y: b.y + 40 }, { x: b.x + 45, y: b.y + 48 }], s)).toBe(false);
  });

  it("keeps a white section's type when the board moves it, and hands it on when it is glued", () => {
    const layout = flow(song("Coda2"), 2000);
    const id = layout.pieces[0]!.id;
    expect(carryRoles(layout, layout.pieces)).toEqual({ [id]: "coda" });
    const renamed = [pieceOf("new", layout.pieces[0]!.parts)];
    expect(carryRoles(layout, renamed)).toEqual({ new: "coda" });
  });

  it("lays parts on the lattice's own corners", () => {
    const parts = sectionParts("verse", 4, { q: 1, r: 1 });
    for (const p of parts) if (p.kind === "tri") for (const c of cornersOf(p.at).map(cornerOf)) expect(Number.isFinite(c.x)).toBe(true);
  });
});

describe("pulling a bar off", () => {
  /** What the board hands back after an Alt-drag: one triangle of `pieceIndex` moved by `step`, as its own piece. */
  const boardPull = (layout: Layout, pieceIndex: number, partIndex: number, step: { i: number; j: number; k?: number }) => {
    const source = layout.pieces[pieceIndex]!;
    const part = source.parts[partIndex]!;
    if (part.kind !== "tri") throw new Error("a triangle");
    const moved = { ...part, at: { i: part.at.i + step.i, j: part.at.j + step.j, k: step.k ?? part.at.k } };
    return [
      ...layout.pieces.filter((p) => p !== source),
      pieceOf(source.id, source.parts.filter((_, n) => n !== partIndex)),
      pieceOf("pulled", [moved]),
    ];
  };

  it("pulls a whole pre-chorus bar (half a cell), not one triangle", () => {
    const layout = flow(song("Pre4"), 2000);
    const next = pullBar(layout, boardPull(layout, 0, 0, { i: -4, j: 8 }), "pulled", 2000)!;
    expect(next).not.toBeNull();
    expect(next.pieces.find((p) => p.id === "pulled")!.parts).toHaveLength(3);
    expect(songOf(next).sections.map((s) => `${s.role}${s.bars}`).sort()).toEqual(["prechorus1", "prechorus3"]);
  });

  it("pulls a whole verse bar (a diamond)", () => {
    const layout = flow(song("Vs4"), 2000);
    const next = pullBar(layout, boardPull(layout, 0, 0, { i: -4, j: 8 }), "pulled", 2000)!;
    expect(next.pieces.find((p) => p.id === "pulled")!.parts).toHaveLength(2);
    expect(songOf(next).sections.map((s) => `${s.role}${s.bars}`).sort()).toEqual(["verse1", "verse3"]);
  });

  it("refuses a bar with no room where it was let go", () => {
    const layout = flow(song("Pre4 Ch4"), 2000);
    // Let go right on the chorus: a triangle of its first cell, pointing the same way.
    const from = layout.pieces[0]!.parts[0]!.at as { i: number; j: number; k: number };
    const cell = layout.pieces[1]!.parts[0]!.at as { q: number; r: number };
    const onto = trisOf(cell).find((t) => t.k === from.k)!;
    expect(pullBar(layout, boardPull(layout, 0, 0, { i: onto.i - from.i, j: onto.j - from.j }), "pulled", 2000)).toBeNull();
  });

  it("leaves a turned triangle to the board's own refusal", () => {
    const layout = flow(song("Pre4"), 2000);
    const tri = layout.pieces[0]!.parts[0]!.at as { k: number };
    expect(pullBar(layout, boardPull(layout, 0, 0, { i: -4, j: 8, k: 1 - tri.k }), "pulled", 2000)).toBeNull();
  });

  it("leaves a chorus alone: a cell is already a bar", () => {
    const layout = flow(song("Ch4"), 2000);
    const source = layout.pieces[0]!;
    const after = [pieceOf(source.id, source.parts.slice(1)), pieceOf("pulled", [source.parts[0]!])];
    expect(pullBar(layout, after, "pulled", 2000)).toBeNull();
  });
});

describe("each bar is one piece", () => {
  const connectedTris = (parts: { kind: string; at: unknown }[]) => {
    const tris = parts.flatMap((p) => (p.kind === "cell" ? trisOf(p.at as { q: number; r: number }) : [p.at as { i: number; j: number; k: 0 | 1 }]));
    const piece = (t: (typeof tris)[number]) => pieceOf("t", [{ kind: "tri", at: t, tone: 0 }]);
    const seen = new Set([0]);
    const stack = [0];
    while (stack.length) {
      const n = stack.pop()!;
      tris.forEach((t, m) => {
        if (!seen.has(m) && touching(piece(tris[n]!), piece(t))) {
          seen.add(m);
          stack.push(m);
        }
      });
    }
    return seen.size === tris.length;
  };

  it("lights a bar that touches all through, for every type and length", () => {
    for (const role of ["verse", "prechorus", "bridge", "intro", "outro", "chorus"] as const)
      for (const bars of [1, 2, 3, 4, 6, 8, 12, 16]) {
        const layout = flow(song(`${{ verse: "Vs", prechorus: "Pre", bridge: "Br", intro: "In", outro: "Out", chorus: "Ch" }[role]}${bars}`), 3000);
        for (const bar of barPartsOf(songOf(layout).order[0]!)) expect(connectedTris(bar)).toBe(true);
      }
  });

  it("makes every intro bar a big triangle, laid out, dropped and lit", () => {
    const isBig = (bar: { at: unknown }[]) => {
      const tris = bar.map((p) => p.at as { i: number; j: number; k: 0 | 1 });
      const piece = (t: (typeof tris)[number]) => pieceOf("t", [{ kind: "tri", at: t, tone: 0 }]);
      return tris.length === 4 && tris.some((t) => tris.filter((u) => u !== t && touching(piece(t), piece(u))).length === 3);
    };
    for (const n of [1, 2, 3, 4, 6, 8]) {
      const order = songOf(flow(song(`In${n}`), 3000)).order;
      expect(order.map((s) => s.bars)).toEqual([n]);
      for (const bar of barPartsOf(order[0]!)) expect(isBig(bar)).toBe(true);
    }
    const dropped = dropBar(flow(song("Ch2"), 3000), "intro", { x: 900, y: 300 }, 3000)!;
    const intro = dropped.pieces.find((p) => p.parts[0]!.tone === 4)!;
    expect(isBig(intro.parts)).toBe(true);
  });

  it("makes a one-bar intro a big triangle", () => {
    const layout = flow(song("In1"), 3000);
    for (const bar of barPartsOf(songOf(layout).order[0]!)) {
      const tris = bar.map((p) => p.at as { i: number; j: number; k: 0 | 1 });
      const piece = (t: (typeof tris)[number]) => pieceOf("t", [{ kind: "tri", at: t, tone: 0 }]);
      expect(tris.some((t) => tris.filter((u) => u !== t && touching(piece(t), piece(u))).length === 3)).toBe(true);
    }
  });
});

describe("what a pull leaves behind", () => {
  it("lays out the rest of a 4-bar intro as a proper 3-bar intro, wherever the bar came from", () => {
    const layout = flow(song("In4"), 3000);
    const source = layout.pieces[0]!;
    for (let n = 0; n < source.parts.length; n++) {
      const part = source.parts[n]!;
      if (part.kind !== "tri") continue;
      const moved = { ...part, at: { i: part.at.i - 6, j: part.at.j + 12, k: part.at.k } };
      const after = [pieceOf(source.id, source.parts.filter((_, m) => m !== n)), pieceOf("pulled", [moved])];
      const next = pullBar(layout, after, "pulled", 3000, true);
      if (!next) continue;
      const order = songOf(next).order;
      const rest = order.find((s) => s.pieceId === source.id)!;
      expect(rest.bars).toBe(3);
      // Already in its proper shape: laying it out again changes nothing.
      const again = songOf(tidySection(next, source.id, 4, 3000)).order.find((s) => s.pieceId === source.id)!;
      const key = (p: { at: unknown }) => JSON.stringify(p.at);
      expect(again.parts.map(key).sort()).toEqual(rest.parts.map(key).sort());
    }
  });
});
