import { describe, expect, it } from "vitest";
import { pieceOf } from "@harmonics/lattice-ui/hexes";
import { boardMetadata } from "../board-metadata.ts";
import { barPartsOf, carryRoles, flow, pullOneBar, splitBar, triMid, songOf } from "../lattice.ts";
import { parse } from "../parse.ts";

describe("board semantic metadata", () => {
  it("preserves intentional markers on a geometry-only edit", () => {
    const sections = parse("Vs7! Ch8").sections;
    const before = flow(sections, 1000);
    expect(boardMetadata(sections, before, songOf(before).sections, before)).toEqual(sections);
  });
  it("tracks reordered same-role pieces by identity instead of occurrence", () => {
    const sections = parse("Vs2! Vs2").sections;
    sections[0]!.chords = ["C:maj", "D:min"];
    sections[1]!.chords = ["F:maj", "G:maj"];
    const before = flow(sections, 1000);
    // Put the second piece on the first piece's old triangles, and vice versa.
    const after = { ...before, pieces: [pieceOf(before.pieces[1]!.id, before.pieces[0]!.parts),
      pieceOf(before.pieces[0]!.id, before.pieces[1]!.parts)] };
    expect(boardMetadata(sections, before, songOf(after).sections, after)).toEqual([sections[1], sections[0]]);
  });
  it("does not overwrite explicit metadata when tidying", () => {
    const sections = parse("Vs7! Ch8").sections;
    const before = flow(sections, 1000);
    expect(boardMetadata(sections, before, sections, flow(sections, 500))).toEqual(sections);
  });
  it("uses explicit bar provenance when pulling and refitting a bar", () => {
    const sections = parse("Vs4!").sections;
    sections[0]!.chords = ["C:maj", "D:min", "E:min", "F:maj"];
    const before = flow(sections, 1000);
    const after = pullOneBar(before, 0, 1000)!;
    const result = boardMetadata(sections, before, songOf(after).sections, after);
    expect(result.map((section) => section.chords)).toEqual([["C:maj", "D:min", "E:min"], ["F:maj"]]);
  });
  it("retains source-bar chords through an Alt-drag split", () => {
    const sections = parse("Vs4!").sections;
    sections[0]!.chords = ["C:maj", "D:min", "E:min", "F:maj"];
    const before = flow(sections, 1000);
    const part = barPartsOf(songOf(before).order[0]!)[1]![0]!;
    expect(part.kind).toBe("tri");
    if (part.kind !== "tri") throw new Error("Expected a verse triangle");
    const split = splitBar(before, triMid(part.at), 1000)!;
    const result = boardMetadata(sections, before, songOf(split.layout).sections, split.layout);
    expect(result.flatMap((section) => section.chords ?? []).sort()).toEqual([...sections[0]!.chords].sort());
  });
  it("keeps the correct chord subset when a section splits", () => {
    const sections = parse("Coda6").sections;
    sections[0]!.chords = ["C:maj", "D:min", "E:min", "F:maj", "G:maj", "A:min"];
    const before = flow(sections, 1000);
    const bars = barPartsOf(songOf(before).order[0]!);
    const pieces = [pieceOf(before.pieces[0]!.id, bars.slice(0, 3).flat()), pieceOf("split", bars.slice(3).flat())];
    const after = { pieces, roles: carryRoles(before, pieces) };
    const result = boardMetadata(sections, before, songOf(after).sections, after);
    expect(result.map((section) => section.chords)).toEqual([sections[0]!.chords.slice(0, 3), sections[0]!.chords.slice(3)]);
  });
});
