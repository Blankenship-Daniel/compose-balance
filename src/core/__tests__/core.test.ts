import { describe, expect, it } from "vitest";
import { classify } from "../classify.ts";
import { CODE, format, parse } from "../parse.ts";
import { corpusFor } from "../corpus.ts";
import { PRESETS } from "../presets.ts";
import { analyze } from "../score.ts";
import { pruneAt } from "../fixes.ts";
import { secondsFor } from "../stats.ts";
import { formatMeter, FOUR_FOUR, type Meter, parseMeter, pulsesPerBar, tempoNote } from "../meter.ts";
import type { Role, Section } from "../types.ts";

function form(text: string): Section[] {
  const { sections, errors } = parse(text);
  expect(errors).toEqual([]);
  return sections;
}

const rules = (text: string, bpm = 100) => analyze(form(text), { bpm, meter: FOUR_FOUR }).findings;

describe("parse", () => {
  it("round-trips notation", () => {
    expect(format(form("In4 Vs8 Pre4 Ch7! Br8 Out4"))).toBe("In4 Vs8 Pre4 Ch7! Br8 Out4");
  });
  it("fills default bar counts and accepts aliases", () => {
    expect(format(form("intro, verse - pre chorus bridge outro"))).toBe("In4 Vs8 Pre4 Br8 Out4");
  });
  it("reports unknown tokens", () => {
    expect(parse("Vs8 X4 Ch8").errors).toHaveLength(1);
    expect(parse("Vs8 X4 Ch8").sections).toHaveLength(2);
  });
  it("shows word codes that can't be read as chords or Roman numerals", () => {
    expect(format(form("I4 V8 PC4 C8 B8 O4"))).toBe("In4 Vs8 Pre4 Ch8 Br8 Out4");
    expect(format(form("in4 vs8 pre4 ch8 br8 out4"))).toBe("In4 Vs8 Pre4 Ch8 Br8 Out4");
  });
  it("accepts SALAMI function labels", () => {
    expect(format(form("introduction8 pre-chorus4 refrain8 instrumental8 transition2 coda4"))).toBe("In8 Pre4 Ch8 Inst8 Tr2 Coda4");
  });
  it("explains that letters are not functions", () => {
    expect(parse("A8 A8 Br8 A8").errors[0]).toMatch(/Vs8 Vs8 Br8 Vs8/);
  });
  it("rejects out-of-range bar counts", () => {
    expect(parse("Vs0 Ch99").errors).toHaveLength(2);
  });
});

describe("classify", () => {
  it.each([
    ["Vs8 Ch8 Vs8 Ch8", "verse-chorus"],
    ["Vs8 Pre4 Ch8", "verse-prechorus-chorus"],
    ["Vs8 Vs8 Br8 Vs8", "aaba"],
    ["Vs8 Vs8 Vs8", "strophic"],
    ["Vs12 Vs12 Vs12", "12-bar-blues"],
  ])("%s is %s", (text, type) => {
    expect(classify(form(text))).toBe(type);
  });
});

describe("user examples", () => {
  // A lone odd chorus is common in real hits (see docs/research.md), so it warns rather than fails.
  it("two 8-bar verses then a 7-bar chorus is mostly balanced", () => {
    const report = analyze(form("Vs8 Vs8 Ch7"));
    expect(report.verdict).toBe("Mostly balanced");
    const r2 = report.findings.find((f) => f.rule === "R2")!;
    expect(r2.severity).toBe("warning");
    expect(r2.sectionIndexes).toEqual([2]);
    expect(r2.fixes.map((f) => format(f.sections))).toContain("Vs8 Vs8 Ch8");
  });

  it("three verses before the chorus is mostly balanced with a delayed-chorus warning", () => {
    const report = analyze(form("V V V C B O"));
    expect(report.verdict).toBe("Mostly balanced");
    expect(report.findings.some((f) => f.rule === "R7" && f.severity === "warning")).toBe(true);
  });
});

describe("era", () => {
  const era = (text: string, e: "classic" | "modern") => analyze(form(text), { bpm: 100, meter: FOUR_FOUR, era: e }).findings;
  it("judges against the chosen era's corpus", () => {
    const ch = (e: "classic" | "modern") => era("Vs8 Ch9 Vs8 Ch8", e).find((f) => f.rule === "R2")!;
    // Modern choruses keep to the grid more often, so a 9-bar one stands out more.
    expect(ch("classic").severity).toBe("info");
    expect(ch("modern").severity).toBe("warning");
    expect(ch("classic").why).toContain("Billboard corpus");
    expect(ch("modern").why).toContain("Harmonix corpus");
  });
});

describe("grid ranking", () => {
  it("ranks a song's phrase lengths among the era's hits", () => {
    const onGrid = analyze(form("In4 Vs8 Ch8 Vs8 Ch8 Out4")).grid;
    expect(onGrid.onGrid).toBe(true);
    expect(onGrid.onGridShare).toBeGreaterThan(0);
    const odd = analyze(form("In4 Vs8 Ch7 Vs8 Ch8 Out4")).grid;
    const odder = analyze(form("In4 Vs9 Ch7 Vs9 Ch7 Br6 Ch7 Vs7 Ch7 Out3")).grid;
    expect(odd.onGrid).toBe(false);
    expect(odd.moreRegularThan).toBeGreaterThan(odder.moreRegularThan);
    expect(odder.moreRegularThan).toBeLessThanOrEqual(0.1); // the song R2 calls unbalanced
  });
});

describe("review fixes", () => {
  it("a song with an odd section is never 'every section on the grid', even where it scores 0", () => {
    expect(analyze(form("In4 Vs8 Ch8 Vs8 Ch8 Coda2")).grid.onGrid).toBe(false);
    expect(analyze(form("In4 Vs8 Ch8 Vs8 Ch7! Out4")).grid.onGrid).toBe(true); // on purpose doesn't count
  });
  it("transition shares from one section sum to 1 over every step", () => {
    const steps = [...(Object.keys(CODE) as Role[]), "end"] as const;
    for (const era of ["classic", "modern"] as const) {
      const sum = steps.reduce((n, to) => n + corpusFor(era).transitionShare("chorus", to), 0);
      expect(sum).toBeCloseTo(1, 1); // "start" can't follow, so a little smoothing mass is left over
    }
  });
  it("exempts a final chorus repeated whole, double or triple", () => {
    expect(rules("Vs8 Ch8 Vs8 Ch8 Br8 Ch16").filter((f) => f.rule === "R4")).toEqual([]);
    expect(rules("Vs8 Ch8 Vs8 Ch8 Br8 Ch24").filter((f) => f.rule === "R4")).toEqual([]);
  });
  it("notes a song longer than 9 in 10 of the era's", () => {
    // 125 bars of 4/4 at 100 bpm is 5:00, past the modern 90th percentile (4:30).
    expect(rules("In8 Vs16 Ch16 Vs16 Ch16 Br16 Ch16 Ch16 Out5").some((f) => f.rule === "R12")).toBe(true);
    expect(rules("In4 Vs8 Ch8 Vs8 Ch8 Br8 Ch8 Out4").some((f) => f.rule === "R12")).toBe(false);
  });
});

describe("rare transitions", () => {
  it("notes a hand-off hit songs almost never make, on its boundary", () => {
    const f = rules("In4 Vs8 Pre4 Ch8 Pre4 Ch8 Br8 Ch8 Out4").find((x) => x.rule === "R11")!;
    expect(f.title).toBe("Chorus into pre-chorus is rare");
    expect(f.severity).toBe("info");
    expect(f.boundaries).toEqual([3]);
    // The fix puts in what usually follows a chorus.
    expect(f.fixes.map((x) => [x.label, format(x.sections)])).toEqual([
      ["Put a verse between them", "In4 Vs8 Pre4 Ch8 Vs8 Pre4 Ch8 Br8 Ch8 Out4"],
    ]);
  });
  it("covers the song's start and end", () => {
    const titles = rules("Br8 Vs8 Pre4 Ch8 Vs8 Tr4").filter((x) => x.rule === "R11").map((x) => x.title);
    expect(titles).toContain("Opening with a bridge is rare");
    expect(titles).toContain("Ending on a transition is rare");
  });
  it("stays quiet on a conventional form and where another rule already explains it", () => {
    expect(rules("In4 Vs8 Pre4 Ch8 Vs8 Pre4 Ch8 Br8 Ch8 Out4").filter((x) => x.rule === "R11")).toEqual([]);
    expect(rules("Vs8 Ch8 Vs8 Ch8 Br8").filter((x) => x.rule === "R11")).toEqual([]);
  });
  it("doesn't call a hand-off rare into a role the corpus barely has", () => {
    // Harmonix has no codas, so every move into one is "rare" by construction.
    expect(corpusFor("modern").sampleSize("coda")).toBe(0);
    expect(rules("In4 Vs8 Ch8 Vs8 Ch8 Co4").filter((x) => x.rule === "R11")).toEqual([]);
  });
});

describe("corpus", () => {
  it("still scores an off-grid section of a role the corpus barely has", () => {
    // Codas in Harmonix and post-choruses in Billboard: none measured, so they lean on every role.
    for (const [era, role] of [["modern", "coda"], ["classic", "postchorus"]] as const) {
      const c = corpusFor(era);
      expect(c.gridShare(role, 1)).toBeLessThan(c.gridShare(role, 0));
    }
  });
});

describe("phrase rules", () => {
  it("odd chorus is worse than odd pre-chorus", () => {
    const four = (unit: string) => Array(4).fill(unit).join(" ");
    expect(rules(four("Vs8 Pre4 Ch6")).find((f) => f.rule === "R2")!.severity).toBe("problem");
    expect(rules(four("Vs8 Pre6 Ch8")).find((f) => f.rule === "R2")!.severity).toBe("info");
  });
  it("odd lengths that add up past most hits make the song unbalanced", () => {
    const report = analyze(form("In4 Vs9 Ch7 Vs9 Ch7 Br6 Ch7 Vs7 Ch7 Out3"));
    expect(report.verdict).toBe("Unbalanced");
    expect(report.findings.filter((f) => f.rule === "R2" && f.severity === "problem").length).toBeGreaterThan(0);
  });
  it("marking a section intentional downgrades it to info", () => {
    expect(rules("Vs8 Vs8 Ch7! Vs8 Ch8").find((f) => f.rule === "R2")!.severity).toBe("info");
  });
  it("applying the suggested fix clears the finding", () => {
    const fix = rules("Vs8 Ch7 Vs8 Ch8").find((f) => f.rule === "R2")!.fixes[0]!;
    expect(format(fix.sections)).toBe("Vs8 Ch8 Vs8 Ch8");
    expect(analyze(fix.sections).findings.filter((f) => f.rule === "R2")).toEqual([]);
  });
  it("two irregular neighbours that sum to the grid are softened", () => {
    const alone = rules("Vs8 Ch7 Vs8 Ch8").find((f) => f.rule === "R2")!;
    const paired = rules("Vs8 Ch7 Inter5 Vs8 Ch8").find((f) => f.rule === "R2" && f.sectionIndexes.includes(1))!;
    expect(alone.severity).toBe("warning");
    expect(paired.severity).toBe("info");
  });
  it("an odd section hits often have is a note, not a warning", () => {
    const f = rules("Vs7 Ch8 Vs8 Ch8").find((x) => x.rule === "R2")!;
    expect(f.severity).toBe("info");
    expect(f.why).toContain("note rather than a warning");
  });
  it("short intros and outros never warn", () => {
    expect(rules("In2 Vs8 Ch8 Vs8 Ch8 Out1").filter((f) => f.severity !== "info")).toEqual([]);
  });
  it("flags a repeated section that changes length where hits rarely do", () => {
    const f = rules("Vs12 Ch8 Vs8 Ch8 Vs8 Ch8").find((x) => x.rule === "R4")!;
    expect(f.severity).toBe("warning");
    expect(f.sectionIndexes).toEqual([0]);
  });
  it("only notes a change hits often make, like a longer last verse", () => {
    const f = rules("Vs8 Ch8 Vs12 Ch8").find((x) => x.rule === "R4")!;
    expect(f.severity).toBe("info");
    expect(f.why).toMatch(/the last verse is longer than the others in \d+% of songs/);
  });
  it("allows an extended final chorus", () => {
    expect(rules("Vs8 Ch8 Vs8 Ch8 Br8 Ch16").filter((f) => f.rule === "R4")).toEqual([]);
  });
});

describe("macro rules", () => {
  it("strophic V V V V does not trigger the delayed-chorus rule", () => {
    expect(rules("Vs8 Vs8 Vs8 Vs8").filter((f) => f.rule === "R7")).toEqual([]);
  });
  it("flags a bridge before the second chorus and offers a move", () => {
    const f = rules("Vs8 Ch8 Br8 Vs8 Ch8").find((x) => x.title.startsWith("Bridge comes"))!;
    expect(format(f.fixes[0]!.sections)).toBe("Vs8 Ch8 Vs8 Ch8 Br8");
  });
  it("flags a missing chorus after the bridge", () => {
    expect(rules("Vs8 Ch8 Vs8 Ch8 Br8 Out4").some((f) => f.title === "No chorus after the bridge")).toBe(true);
  });
  it("flags AABA with a premature B", () => {
    expect(rules("Vs8 Br8 Vs8 Vs8").some((f) => f.rule === "R9")).toBe(true);
  });
  it("time to first chorus depends on tempo", () => {
    expect(rules("In8 Vs16 Pre8 Ch8 Vs16 Ch8", 70).some((f) => f.title.startsWith("First chorus") && f.severity === "warning")).toBe(true);
    expect(rules("In4 Vs8 Ch8 Vs8 Ch8", 120).some((f) => f.title.startsWith("First chorus"))).toBe(false);
  });
  it("offers ways to bring a late first chorus forward", () => {
    const fixes = (form: string, bpm: number) =>
      rules(form, bpm).find((x) => x.title.startsWith("First chorus"))!.fixes.map((x) => [x.label, format(x.sections)]);
    // Either cut alone clears the note.
    expect(fixes("In8 Vs16 Ch8 Vs16 Ch8", 90)).toEqual([
      ["Shorten the intro to 4 bars", "In4 Vs16 Ch8 Vs16 Ch8"],
      ["Halve the verse to 8 bars", "In8 Vs8 Ch8 Vs16 Ch8"],
    ]);
    // Neither alone brings it under the warning: only both together are offered.
    expect(fixes("In8 Vs16 Pre8 Ch8 Vs16 Ch8", 70)).toEqual([
      ["Shorten the intro to 4 bars and halve the verse to 8", "In4 Vs8 Pre8 Ch8 Vs16 Ch8"],
    ]);
  });
  it("offers shortening a long intro once, on the intro's own note", () => {
    const fs = rules("In16 Vs16 Ch8 Vs16 Ch8", 100);
    const labels = fs.flatMap((f) => f.fixes.map((x) => x.label)).filter((l) => l === "Shorten the intro to 4 bars");
    expect(fs.some((f) => f.title.startsWith("Long intro"))).toBe(true);
    expect(labels).toHaveLength(1);
  });
  it("notes an intro longer than 9 in 10 of the era's", () => {
    const intro = (form: string) => rules(form).find((f) => f.title.startsWith("Long intro"));
    expect(intro("In16 Vs8 Ch8 Vs8 Ch8")?.why).toContain("9 in 10 intros last under");
    expect(intro("In8 Vs8 Ch8 Vs8 Ch8")).toBeUndefined();
    // At a slow tempo a 4-bar intro runs long, but there is no shorter phrase to cut it to.
    expect(rules("In4 Vs8 Ch8 Vs8 Ch8", 30).find((f) => f.title.startsWith("Long intro"))).toBeUndefined();
  });
});

describe("presets", () => {
  it.each(PRESETS.filter((p) => !p.name.startsWith("Example")))("$name is balanced", (p) => {
    expect(analyze(parse(p.notation).sections, { bpm: p.bpm, meter: FOUR_FOUR }).verdict).toBe("Balanced");
  });
});

const meter = (text: string) => parseMeter(text) as Meter;

describe("meter", () => {
  it.each([
    ["4/4", [1, 1, 1, 1], 4],
    ["6/8", [3, 3], 2],
    ["12/8", [3, 3, 3, 3], 4],
    ["7/8", [2, 2, 3], 7],
    ["5/8", [2, 3], 5],
    ["3+3+2/8", [3, 3, 2], 8],
    ["5/4", [1, 1, 1, 1, 1], 5],
    ["3/8", [1, 1, 1], 3],
  ])("%s groups as %j with %i counted beats", (text, groups, pulses) => {
    expect(meter(text).groups).toEqual(groups);
    expect(pulsesPerBar(meter(text))).toBe(pulses);
  });
  it.each(["7/5", "0/4", "4", "abc", "33/8", "3+0/8"])("rejects %s with a message", (text) => {
    expect(typeof parseMeter(text)).toBe("string");
  });
  it("writes default groupings compactly and custom ones in full", () => {
    expect(formatMeter(meter(" 7 / 8 "))).toBe("7/8");
    expect(formatMeter(meter("2+2+3/8"))).toBe("7/8");
    expect(formatMeter(meter("3+2+2/8"))).toBe("3+2+2/8");
  });
  it("names the note the tempo counts", () => {
    expect(tempoNote(meter("4/4")).name).toBe("quarter");
    expect(tempoNote(meter("7/8")).name).toBe("eighth");
    expect(tempoNote(meter("6/8")).name).toBe("dotted quarter");
    expect(tempoNote(meter("2/2")).name).toBe("half");
  });
});

describe("duration", () => {
  it.each([
    [8, 120, "4/4", 16],
    [4, 90, "3/4", 8],
    [4, 120, "6/8", 4], // dotted quarters: 2 per bar
    [1, 60, "12/8", 4],
    [4, 210, "7/8", 8], // eighth notes: 28 of them
    [4, 120, "5/4", 10],
    [2, 60, "2/2", 4],
  ])("%i bars at %i bpm in %s = %i s", (bars, bpm, m, sec) => {
    expect(secondsFor(bars, { bpm, meter: meter(m) })).toBe(sec);
  });
  it("totals a 6/8 form", () => {
    expect(analyze(form("Vs8 Ch8 Vs8 Ch8"), { bpm: 60, meter: meter("6/8") }).seconds).toBe(64);
  });
});

describe("pruneAt", () => {
  it("cuts a section at a barline", () => {
    expect(format(pruneAt(form("Vs8 Ch8"), 0, 6))).toBe("Vs6 Ch8");
  });
  it("removes a section cut at 0", () => {
    expect(format(pruneAt(form("Vs8 Ch8 Vs8"), 1, 0))).toBe("Vs8 Vs8");
  });
  it("leaves a section alone when the cut is at or past its end", () => {
    const sections = form("Vs8 Ch8");
    expect(pruneAt(sections, 0, 8)).toBe(sections);
    expect(pruneAt(sections, 5, 2)).toBe(sections);
  });
  it("clears the on-purpose mark when it trims", () => {
    expect(format(pruneAt(form("Ch7!"), 0, 4))).toBe("Ch4");
  });
});

describe("boundaries", () => {
  it("marks the hand-off out of an odd-length section", () => {
    expect(rules("Vs8 Ch7 Vs8 Ch8").find((f) => f.rule === "R2")!.boundaries).toEqual([1]);
  });
  it("marks the stacked verses and the hand-off into the late chorus", () => {
    expect(rules("Vs8 Vs8 Vs8 Ch8 Vs8 Ch8").find((f) => f.rule === "R7")!.boundaries).toEqual([0, 1, 2]);
  });
  it("marks the hand-off into an early bridge and out of an unresolved one", () => {
    expect(rules("Vs8 Ch8 Br8 Vs8 Ch8").find((f) => f.title.startsWith("Bridge comes"))!.boundaries).toEqual([1]);
    expect(rules("Vs8 Ch8 Vs8 Ch8 Br8 Out4").find((f) => f.title === "No chorus after the bridge")!.boundaries).toEqual([4]);
  });
});
