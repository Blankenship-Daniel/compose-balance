import { describe, expect, it } from "vitest";
import { harteNotes } from "../../audio/chords.ts";
import { FOUR_FOUR } from "../meter.ts";
import { fromAnnotation, lineBars, MAX_ANNOTATION_BYTES, toBillboard } from "../salami.ts";

const opts = { bpm: 120, meter: FOUR_FOUR };
const reject = (text: string, message: RegExp) => {
  const result = fromAnnotation(text, opts);
  expect(result.sections).toEqual([]);
  expect(result.notes).toHaveLength(1);
  expect(result.notes[0]).toMatch(message);
  expect(result.title).toBeUndefined();
};

describe("bounded atomic annotation import", () => {
  it.each(["1000000000", "9".repeat(400), "0"])("rejects repeat x%s before expansion", (repeat) => {
    expect(() => lineBars(`| C:maj | x${repeat}`)).toThrow(/repeat/);
    reject(`# title: discarded\n0 A, verse, | C:maj |\n2 B, chorus, | N | x${repeat}`, /repeat/);
  });

  it("bounds bytes (including UTF-8), lines, and sections", () => {
    reject("#".repeat(MAX_ANNOTATION_BYTES + 1), /bytes/);
    reject("é".repeat(MAX_ANNOTATION_BYTES / 2 + 1), /bytes/);
    reject("\n".repeat(10_000), /lines/);
    reject(Array.from({ length: 513 }, (_, i) => `${i} A, verse, | N |`).join("\n"), /sections/);
  });

  it("bounds combined expansion across lines and runs", () => {
    reject("0 A, verse, | N | x20000\n1 | N | x20000", /expanded bars/);
    expect(() => lineBars("| N | x20000, | N | x20000")).toThrow(/expanded bars/);
  });

  it("bounds per-bar and repeated chord tokens", () => {
    expect(() => lineBars(`| ${"N ".repeat(257)}|`)).toThrow(/chord tokens/);
    reject("0 A, verse, | N N N | x30000", /chord tokens/);
    reject("0 A, verse, | N N N | x11000\n1 | N N N | x11000", /chord tokens/);
  });

  it.each(["e", "1e309", "--2", "NaN", "Infinity", "0x10"])("rejects malformed/nonfinite timestamp %s atomically", (time) => {
    reject(`0 A, verse, | C:maj |\n${time} end`, /timestamp/i);
  });

  it("rejects backwards timestamps but accepts ties and negative pickup times", () => {
    reject("0 A, verse\n-1 end", /chronological/);
    expect(fromAnnotation("-1 A, verse\n-1 | C:maj |\n0 end", opts).sections[0]?.bars).toBe(1);
  });

  it("rejects overflowing estimates and invalid bar duration", () => {
    reject("-1e308 A, verse\n1e308 end", /finite positive integers/);
    expect(fromAnnotation("0 A, verse\n2 end", { ...opts, bpm: NaN }).sections).toEqual([]);
    const result = fromAnnotation("0 A, verse\n1e308 end", opts);
    expect(result.sections[0]?.bars).toBe(64);
    expect(result.notes.join(" ")).toMatch(/clipped/);
    expect(result.sections.every((s) => Number.isFinite(s.bars) && Number.isInteger(s.bars))).toBe(true);
  });

  it("warns explicitly on clipping without changing the established section shape", () => {
    const result = fromAnnotation("0 A, verse, | N | x65\n130 end", opts);
    expect(result.sections[0]).toMatchObject({ role: "verse", bars: 64, chords: Array(64).fill("N") });
    expect(result.notes).toContain("Section 1 (verse) was clipped from 65 to 64 bars.");
  });
});

describe("annotation semantics", () => {
  it.each(["constructor", "__proto__", "toString"])("does not accept inherited function label %s", (label) => {
    const result = fromAnnotation(`0 A, ${label}, | N |\n2 end`, opts);
    expect(result.sections[0]?.role).toBe("interlude");
    expect(result.notes.join(" ")).toContain(label.toLowerCase());
  });

  it("uses the usual unknown-quality fallback, not inherited shorthand properties", () => {
    expect(harteNotes("C:constructor")).toEqual(harteNotes("C:unknown"));
  });

  it("preserves entirely silent and held bars through export", () => {
    const result = fromAnnotation("0 A, verse, | N | &pause | . | * |\n8 end", opts);
    expect(result.sections[0]?.chords).toEqual(["N", "&pause", ".", "*"]);
    expect(toBillboard(result.sections, opts)).toContain("| N | &pause | . | * |");
  });

  it("preserves an explicit empty held bar during export", () => {
    const result = fromAnnotation("0 A, verse, | C:maj | |\n4 end", opts);
    expect(result.sections[0]?.chords).toEqual(["C:maj", ""]);
    expect(toBillboard(result.sections, opts)).toContain("| C:maj |  |");
  });

  it("round-trips nondefault additive meter grouping", () => {
    const meter = { beats: 7, unit: 8, groups: [3, 2, 2] };
    const sections = fromAnnotation("0 A, verse, | N |\n2 end", opts).sections;
    const text = toBillboard(sections, { ...opts, meter });
    expect(text).toContain("# metre: 3+2+2/8");
    expect(fromAnnotation(text, opts).meter).toEqual(meter);
  });
});
