import { describe, expect, it } from "vitest";
import { clampBpm, MAX_DOCUMENT_CHARS, readDocument, writeDocument } from "../document.ts";
import { parse } from "../parse.ts";
import { FOUR_FOUR } from "../meter.ts";

const opts = { bpm: 120, meter: FOUR_FOUR, era: "classic" as const };
describe("shared documents", () => {
  it("round trips imported chords, silence, ordering and intentional markers", () => {
    const sections = parse("Vs2! Vs2 Ch4").sections;
    sections[0]!.chords = ["N", "."];
    sections[1]!.chords = ["F#:min7", "G#:min7"];
    const reordered = [sections[1]!, sections[0]!, sections[2]!];
    expect(readDocument(writeDocument(reordered, opts))).toEqual({ sections: reordered, opts, song: undefined });
  });
  it("retains compatibility with legacy corpus links", () => {
    expect(readDocument("#f=Vs8%20Ch8&bpm=86&m=4%2F4&song=bb0473")?.song).toBe("bb0473");
  });
  it("allows an empty form without reverting to the preset", () => {
    expect(readDocument(writeDocument([], opts))?.sections).toEqual([]);
  });
  it("uses the versioned payload rather than its display-only notation", () => {
    const hash = writeDocument([{ role: "verse", bars: 1, intentional: false, chords: ["N"] }], opts);
    expect(readDocument(hash.replace("f=Vs1", "f=Ch8"))?.sections[0]!.role).toBe("verse");
  });
  it.each([
    { v: 2, sections: [] },
    { v: 1, sections: [{ role: "constructor", bars: 8, intentional: false }] },
    { v: 1, sections: [{ role: "verse", bars: null, intentional: false }] },
    { v: 1, sections: [{ role: "verse", bars: 8, intentional: false, chords: [false] }] },
  ])("rejects malformed payloads", (document) => {
    expect(() => readDocument(`#d=${encodeURIComponent(JSON.stringify(document))}`)).toThrow();
  });
  it("bounds hash and section counts before layout", () => {
    expect(() => readDocument("#".repeat(MAX_DOCUMENT_CHARS + 1))).toThrow(/large/);
    expect(() => readDocument(`#f=${Array(257).fill("Vs1").join("+")}`)).toThrow(/limits/);
  });
  it("keeps additive meter timing", () => {
    const meter = { beats: 6, unit: 8, groups: [2, 2, 2] };
    expect(readDocument(writeDocument(parse("Vs8").sections, { ...opts, meter }))?.opts.meter).toEqual(meter);
  });
  it("normalizes invalid tempos and settings", () => {
    expect(clampBpm(Infinity)).toBe(100);
    expect(readDocument("#f=Vs8&m=bad&era=constructor")?.opts).toEqual({ bpm: 100, meter: FOUR_FOUR, era: "modern" });
  });
});
