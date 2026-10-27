import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FOUR_FOUR } from "../meter.ts";
import { format, parse } from "../parse.ts";
import { fromAnnotation, letters, toBillboard } from "../salami.ts";

const fixture = (name: string) => readFileSync(join(__dirname, "fixtures", name), "utf8");
const opts = { bpm: 100, meter: FOUR_FOUR };

describe("letters", () => {
  it("gives repeated functions the same SALAMI letter", () => {
    expect(letters(parse("Vs8 Vs8 Br8 Vs8").sections).join("")).toBe("AABA");
    expect(letters(parse("In4 Vs8 Ch8 Vs8 Ch8 Br8 Ch8").sections).join("")).toBe("ABCBCDC");
  });
});

describe("Billboard export", () => {
  const text = toBillboard(parse("In4 Vs8 Ch7 Out4").sections, opts);
  it("writes the header, labelled sections, barlines and an end line", () => {
    const lines = text.trim().split("\n");
    expect(lines.slice(0, 4)).toEqual(["# title: Untitled sketch", "# artist: compose-balance", "# metre: 4/4", "# tonic: C"]);
    expect(lines[5]).toBe("0\tA, intro, | C:maj | F:maj | C:maj | G:maj |");
    expect(lines[6]).toBe("9.6\tB, verse, | A:min | F:maj | C:maj | G:maj |");
    expect(lines.at(-1)).toBe(`${(23 * 2.4).toFixed(1)}\tend`);
  });
  it("round-trips through import", () => {
    expect(format(fromAnnotation(text, opts).sections)).toBe("In4 Vs8 Ch7 Out4");
  });
});

describe("McGill Billboard import", () => {
  it("counts bars from barlines in a real annotation", () => {
    const result = fromAnnotation(fixture("billboard-0003.txt"), opts);
    expect(result.title).toBe("I Don't mind");
    expect(result.meter).toEqual({ beats: 6, unit: 8, groups: [3, 3] });
    expect(format(result.sections)).toBe("In12 Vs16 Vs16 Inter16 Vs16 Inter9");
    expect(result.notes).toEqual([]);
  });
});

describe("SALAMI import", () => {
  it("estimates bars from timestamps when there are no barlines", () => {
    const result = fromAnnotation(fixture("salami-10-textfile1.txt"), { bpm: 73, meter: FOUR_FOUR });
    expect(result.sections.map((s) => s.role)).toEqual(["intro", "verse", "interlude", "verse", "bridge", "verse", "outro"]);
    expect(result.sections[0]!.bars).toBe(16);
    expect(result.notes.some((n) => n.includes("estimated"))).toBe(true);
  });
  it("reports lines it cannot read", () => {
    expect(fromAnnotation("nonsense", opts).notes.length).toBeGreaterThan(0);
  });
});
