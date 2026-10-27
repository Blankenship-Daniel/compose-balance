import { describe, expect, it } from "vitest";
import { barChords, harteNotes } from "../../audio/chords.ts";
import { carryChords } from "../chords.ts";
import { FOUR_FOUR } from "../meter.ts";
import { format, parse } from "../parse.ts";
import { fromAnnotation, lineBars, toBillboard } from "../salami.ts";
import { hitSections, loadHits, restoreChords, songOf } from "../songs.ts";
import type { Section } from "../types.ts";

const opts = { bpm: 120, meter: FOUR_FOUR };

describe("Billboard bars", () => {
  it("writes out repeats and keeps commas inside chords", () => {
    expect(lineBars("A, intro, | C:maj | x4, (bass)")).toEqual(["C:maj", "C:maj", "C:maj", "C:maj"]);
    expect(lineBars("D, chorus, | B:sus4(b7,9) B:7 | E:min7 . A:7 |")).toEqual(["B:sus4(b7,9) B:7", "E:min7 . A:7"]);
    expect(lineBars("| (2/4) A:maj | G:maj |, voice)")).toEqual(["A:maj", "G:maj"]);
    expect(lineBars("A, verse")).toEqual([]);
  });

  it("counts every bar of a repeated or comma-chord line, and keeps its chords", () => {
    const text = [
      "# metre: 4/4",
      "0.0\tA, intro, | C:maj | x4, (bass)",
      "8.0\tB, chorus, | B:sus4(b7,9) | B:7 |, (voice",
      "12.0\t| E:min | N |, voice)",
      "16.0\tend",
    ].join("\n");
    const { sections } = fromAnnotation(text, opts);
    expect(format(sections)).toBe("In4 Ch4");
    expect(sections[1]!.chords).toEqual(["B:sus4(b7,9)", "B:7", "E:min", "N"]);
  });

  it("exports a song's own chords, and placeholders where it has none", () => {
    const sections: Section[] = [{ role: "verse", bars: 2, intentional: false, chords: ["A:min7"] }];
    expect(toBillboard(sections, opts)).toContain("| A:min7 | F:maj |");
  });
});

describe("harteNotes", () => {
  it("voices triads and sevenths from the root", () => {
    expect(harteNotes("C:maj")).toEqual([60, 64, 67]);
    expect(harteNotes("A:min")).toEqual([57, 60, 64]);
    expect(harteNotes("G:7")).toEqual([55, 59, 62, 65]);
    expect(harteNotes("Bb:maj")).toEqual([58, 62, 65]);
  });

  it("adds and removes extensions, and puts an inversion's bass first", () => {
    expect(harteNotes("E:7(#9)")).toEqual([64, 68, 71, 74, 79]);
    expect(harteNotes("C:maj(*5)")).toEqual([60, 64]);
    expect(harteNotes("F:maj/3")).toEqual([57, 65, 69, 72]);
  });

  it("is silent for no chord or one it can't read", () => {
    expect(harteNotes("N")).toBeNull();
    expect(harteNotes("&pause")).toBeNull();
    expect(harteNotes("C:maj")).not.toBeNull();
  });

  it("reads every chord in the Billboard song list", async () => {
    const hits = await loadHits();
    const tokens = new Set(hits.flatMap((h) => (h.chords ?? "").split(/[| ]/)).filter((t) => /^[A-G]/.test(t)));
    expect([...tokens].filter((t) => harteNotes(t) === null)).toEqual([]);
  });
});

describe("barChords", () => {
  it("splits a bar evenly and holds a chord through dots", () => {
    expect(barChords("F:maj . . G:maj", null)).toEqual([
      { chord: "F:maj", at: 0, length: 0.75 },
      { chord: "G:maj", at: 0.75, length: 0.25 },
    ]);
  });

  it("carries the last chord into a bar that starts with a hold, and keeps silence silent", () => {
    expect(barChords(".", "A:min")).toEqual([{ chord: "A:min", at: 0, length: 1 }]);
    expect(barChords("N .", "A:min")).toEqual([{ chord: null, at: 0, length: 1 }]);
  });
});

describe("song chords", () => {
  it("gives every Billboard bar a chord entry", async () => {
    const hits = (await loadHits()).filter((h) => h.era === "classic");
    expect(hits.every((h) => h.chords)).toBe(true);
    for (const h of hits) {
      const sections = hitSections(h);
      expect(sections.reduce((n, s) => n + s.chords!.length, 0), h.title).toBe(h.chords!.split("|").length);
      expect(sections.every((s) => s.chords!.length === s.bars), h.title).toBe(true);
    }
  });

  it("leaves Harmonix songs on placeholder chords", async () => {
    const hit = (await loadHits()).find((h) => h.era === "modern")!;
    expect(hitSections(hit).some((s) => s.chords)).toBe(false);
  });
});

describe("carryChords", () => {
  const song: Section[] = [
    { role: "verse", bars: 2, intentional: false, chords: ["A:min", "C:maj"] },
    { role: "chorus", bars: 2, intentional: false, chords: ["F:maj", "G:maj"] },
  ];

  it("keeps chords on sections that move", () => {
    const moved = carryChords(song, parse("Ch2 Vs2").sections);
    expect(moved.map((s) => s.chords)).toEqual([["F:maj", "G:maj"], ["A:min", "C:maj"]]);
  });

  it("keeps them through a length change, and gives an added section none", () => {
    const next = carryChords(song, parse("Vs3 Ch2 Ch2").sections);
    expect(next[0]!.chords).toEqual(["A:min", "C:maj"]);
    expect(next.filter((s) => s.chords).length).toBe(2);
  });

  it("leaves a form with no chords alone", () => {
    const plain = parse("Vs8 Ch8").sections;
    expect(carryChords(plain, parse("Ch8 Vs8").sections).some((s) => s.chords)).toBe(false);
  });
});

describe("links to a loaded hit", () => {
  it("names the hit while its chords are on the form, through edits", async () => {
    const hit = (await loadHits()).find((h) => h.title === "Come Together")!;
    const loaded = hitSections(hit);
    expect(songOf(loaded)).toBe(hit.id);
    const moved = carryChords(loaded, [...loaded].reverse().map(({ chords: _, ...s }) => s));
    expect(songOf(moved)).toBe(hit.id);
    expect(songOf(parse("Vs8 Ch8").sections)).toBeUndefined();
  });

  it("puts the chords back on a linked form, edited or not", async () => {
    const hit = (await loadHits()).find((h) => h.title === "Come Together")!;
    const restored = (await restoreChords(hit.id, parse(hit.form).sections))!;
    expect(restored.map((s) => s.chords)).toEqual(hitSections(hit).map((s) => s.chords));
    const edited = (await restoreChords(hit.id, parse(`${hit.form} Ch4`).sections))!;
    expect(edited.filter((s) => s.chords).length).toBe(hitSections(hit).length);
  });

  it("gives every song an id, and none twice", async () => {
    const ids = (await loadHits()).map((h) => h.id);
    expect(ids.every((id) => /^(bb|hx)\d{4}$/.test(id))).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("ignores an unknown id", async () => {
    expect(await restoreChords("bb9999", parse("Vs8").sections)).toBeUndefined();
  });
});
