import { describe, expect, it } from "vitest";
import { barEvents, type BarContext, pulses } from "../../audio/patterns.ts";
import { FOUR_FOUR, parseMeter, type Meter } from "../meter.ts";

const meter = (text: string) => parseMeter(text) as Meter;
const C = [60, 64, 67];
const bar = (over: Partial<BarContext>): BarContext => ({
  role: "verse",
  bar: 1,
  sectionBars: 8,
  lastSection: false,
  meter: FOUR_FOUR,
  chords: [{ notes: C, at: 0, length: 1 }],
  ...over,
});
const drums = (ctx: BarContext, sound: string) =>
  barEvents(ctx).flatMap((e) => (e.part === "drums" && e.sound === sound ? [e.at] : []));

describe("pulses", () => {
  it("follows the meter's beat groups", () => {
    expect(pulses(FOUR_FOUR)).toEqual([0, 0.25, 0.5, 0.75]);
    expect(pulses(meter("6/8"))).toEqual([0, 0.5]);
    expect(pulses(meter("2+2+3/8")).map((x) => x.toFixed(3))).toEqual(["0.000", "0.286", "0.571"]);
  });
});

describe("barEvents", () => {
  it("plays kick on 1 and 3, snare on 2 and 4 in a 4/4 verse", () => {
    expect(drums(bar({}), "kick")).toEqual([0, 0.5]);
    expect(drums(bar({}), "snare")).toEqual([0.25, 0.75]);
  });

  it("keeps an intro sparse and opens a chorus with a crash", () => {
    expect(drums(bar({ role: "intro" }), "snare")).toEqual([]);
    expect(drums(bar({ role: "chorus", bar: 0 }), "crash")).toEqual([0]);
    expect(drums(bar({ role: "verse", bar: 0 }), "crash")).toEqual([]);
  });

  it("fills into the next section, but not out of the last one", () => {
    expect(drums(bar({ bar: 7 }), "tom-1")).toEqual([0.75]);
    expect(drums(bar({ bar: 7, lastSection: true }), "tom-1")).toEqual([]);
    expect(drums(bar({ bar: 6 }), "tom-1")).toEqual([]);
  });

  it("puts the backbeat on the second group in 6/8", () => {
    expect(drums(bar({ meter: meter("6/8") }), "snare")).toEqual([0.5]);
  });

  it("plays each chord's bass in the double bass's range, and rests for no chord", () => {
    const events = barEvents(bar({ chords: [{ notes: [57, 65, 69, 72], at: 0, length: 0.5 }, { notes: null, at: 0.5, length: 0.5 }] }));
    const bass = events.filter((e) => e.part === "bass");
    expect(bass.map((e) => e.part !== "drums" && e.notes[0])).toEqual([45 - 12]);
    expect(events.filter((e) => e.part === "keys")).toHaveLength(1);
  });

  it("restrikes a whole-bar chord halfway in fuller sections", () => {
    const strikes = (role: BarContext["role"]) => barEvents(bar({ role })).filter((e) => e.part === "bass").map((e) => e.at);
    expect(strikes("intro")).toEqual([0]);
    expect(strikes("chorus")).toEqual([0, 0.5]);
  });
});

describe("pad", () => {
  const pad = (over: Partial<BarContext>) => barEvents(bar(over)).filter((e) => e.part === "pad");

  it("holds the chord's upper notes in fuller sections only", () => {
    expect(pad({ role: "verse", pad: "sustain" })).toEqual([]);
    expect(pad({ role: "chorus", pad: "sustain" })).toEqual([{ part: "pad", notes: [76, 79], at: 0, length: 1, velocity: 70 }]);
    expect(pad({ role: "chorus" })).toEqual([]);
  });

  it("rings bells once, at a section's start", () => {
    expect(pad({ role: "verse", bar: 0, pad: "accent" })).toHaveLength(1);
    expect(pad({ role: "verse", bar: 1, pad: "accent" })).toEqual([]);
  });
});
