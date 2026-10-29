import { describe, expect, it } from "vitest";
import { pieceOf, touching, turned, type Part } from "@harmonics/lattice-ui/hexes";
import { carryRoles, flow, layoutBarSources, pullOneBar, songOf, type Layout } from "../lattice.ts";
import { format, parse } from "../parse.ts";

const layoutOf = (text: string) => flow(parse(text).sections, 2000);
const read = (before: Layout, pieces: Layout["pieces"]) => songOf({ pieces, roles: carryRoles(before, pieces) });
const movedParts = (parts: Part[]): Part[] => parts.map((part) => part.kind === "tri"
  ? { ...part, at: { ...part.at, i: part.at.i + 100 } }
  : { ...part, at: { ...part.at, q: part.at.q + 100 } });

// A straight strip of six coda bars, with two connected three-bar halves.
const codaStrip = (): Layout => {
  const parts: Part[] = Array.from({ length: 12 }, (_, i) => [0, 1].map((k) => ({
    kind: "tri" as const, tone: 7, at: { i, j: 0, k: k as 0 | 1 },
  }))).flat();
  return { pieces: [pieceOf("coda", parts)], roles: { coda: "coda" } };
};

describe("pull-one-bar provenance", () => {
  it.each(["V4", "Coda4"])("records original bar indices after refitting %s", (text) => {
    const before = layoutOf(text);
    const source = songOf(before).order[0]!;
    const after = pullOneBar(before, 0, 2000);
    expect(after).not.toBeNull();
    const provenance = layoutBarSources.get(after!);
    expect(provenance?.before).toBe(before);
    const bar = after!.pieces.find((piece) => piece.id !== source.pieceId)!;
    expect(provenance?.sources).toEqual([
      { pieceId: source.pieceId, sourcePieceId: source.pieceId, role: source.role, bars: [0, 1, 2] },
      { pieceId: bar.id, sourcePieceId: source.pieceId, role: source.role, bars: [3] },
    ]);
    expect(songOf(after!).sections.map((section) => section.bars).sort()).toEqual([1, 3]);
    expect(layoutBarSources.has(before)).toBe(false);
  });
});

describe("shared-color role provenance", () => {
  it("keeps both connected fragments' role when one retains the original ID", () => {
    const before = codaStrip();
    expect(format(songOf(before).sections)).toBe("Coda6");
    const parts = before.pieces[0]!.parts;
    const pieces = [pieceOf("coda", parts.slice(0, 12)), pieceOf("cut", parts.slice(12))];
    for (const piece of pieces) {
      expect(songOf({ pieces: [piece], roles: { [piece.id]: "coda" } }).sections).toHaveLength(1);
      expect(piece.parts.every((part) => piece.parts.some((other) => other !== part
        && touching(pieceOf("a", [part]), pieceOf("b", [other]))))).toBe(true);
    }
    const result = read(before, pieces);
    expect(result.whole).toBe(true);
    expect(format(result.sections)).toBe("Coda3 Coda3");
  });

  it("matches multiple renamed originals by geometry, not missing-role order", () => {
    const before = layoutOf("Tr4 Coda4");
    const pieces = before.pieces.map((piece, index) => pieceOf(`renamed-${index}`, piece.parts));
    expect(format(read(before, pieces).sections)).toBe("Tr4 Coda4");
    expect(carryRoles(before, [...pieces].reverse())).toEqual({ "renamed-0": "transition", "renamed-1": "coda" });
  });

  it("keeps exact-ID roles when pieces move or rotate away from their old triangles", () => {
    const before = layoutOf("Tr4 Coda4");
    const pieces = before.pieces.map((piece) => turned(pieceOf(piece.id, movedParts(piece.parts)), 1));
    expect(carryRoles(before, pieces)).toEqual(before.roles);
    expect(read(before, pieces).sections.map(({ role, bars }) => ({ role, bars }))).toEqual([
      { role: "transition", bars: 4 }, { role: "coda", bars: 4 },
    ]);
  });

  it("keeps exact roles when equal-size pieces exchange their old destinations", () => {
    const before = layoutOf("Tr4 Coda1");
    const pieces = before.pieces.map((piece, index) => pieceOf(piece.id, before.pieces[1 - index]!.parts));
    expect(carryRoles(before, pieces)).toEqual(before.roles);
    expect(read(before, pieces).whole).toBe(true);
  });

  it("keeps exact roles when a refit overlaps another surviving role's old triangles", () => {
    const before = layoutOf("Tr4 Coda4");
    const pieces = [
      pieceOf(before.pieces[0]!.id, before.pieces[1]!.parts.slice(0, 4)),
      pieceOf(before.pieces[1]!.id, movedParts(before.pieces[1]!.parts)),
    ];
    expect(carryRoles(before, pieces)).toEqual(before.roles);
  });

  it("rejects mixed glue even when all IDs survive but their triangle counts change", () => {
    const before = layoutOf("Tr4 Coda4");
    const [transition, coda] = before.pieces;
    const pieces = [
      pieceOf(transition!.id, [...transition!.parts, coda!.parts[0]!]),
      pieceOf(coda!.id, coda!.parts.slice(1)),
    ];
    expect(() => carryRoles(before, pieces)).toThrow(/different shared-color roles/i);
  });

  it("preserves a moved piece with a new ID when the disappeared role is unambiguous", () => {
    const before = layoutOf("Coda4");
    const pieces = [pieceOf("moved", movedParts(before.pieces[0]!.parts))];
    expect(carryRoles(before, pieces)).toEqual({ moved: "coda" });
  });

  it("uses a unanimous disappeared role even when several original IDs disappeared", () => {
    const before = layoutOf("Coda2 Coda4");
    const pieces = before.pieces.map((piece, index) => pieceOf(`moved-${index}`, movedParts(piece.parts)));
    expect(carryRoles(before, pieces)).toEqual({ "moved-0": "coda", "moved-1": "coda" });
  });

  it("does not assign roles to non-shared pieces or inspect their triangle ownership", () => {
    const before = layoutOf("Coda4");
    const parts = before.pieces[0]!.parts.map((part) => ({ ...part, tone: 1 }));
    expect(carryRoles(before, [pieceOf("verse", parts)])).toEqual({});
  });

  it("does not pick the first disappeared role for an ambiguous moved piece", () => {
    const before = layoutOf("Tr4 Coda4");
    const pieces = [pieceOf("unknown", movedParts(before.pieces[1]!.parts))];
    expect(() => carryRoles(before, pieces)).toThrow(/source role/i);
  });

  it.each(["new-glue", "retained"])("rejects mixed-role glue with ID %s", (id) => {
    const before = layoutOf("Tr4 Coda4");
    const glueId = id === "retained" ? before.pieces[0]!.id : id;
    const pieces = [pieceOf(glueId, before.pieces.flatMap((piece) => piece.parts))];
    expect(() => carryRoles(before, pieces)).toThrow(/different shared-color roles/i);
  });

  it("allows glue whose sources all have the same role", () => {
    const before = layoutOf("Coda2 Coda2");
    const pieces = [pieceOf("glued", before.pieces.flatMap((piece) => piece.parts))];
    expect(carryRoles(before, pieces)).toEqual({ glued: "coda" });
  });
});
