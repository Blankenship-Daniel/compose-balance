import { pulsesPerBar } from "./meter.ts";
import type { Options, Role, Section } from "./types.ts";

/** Seconds for `bars` bars; the tempo counts the meter's pulses (see pulsesPerBar). */
export function secondsFor(bars: number, opts: Options): number {
  return (bars * pulsesPerBar(opts.meter) * 60) / opts.bpm;
}

export function totalBars(sections: Section[]): number {
  return sections.reduce((n, s) => n + s.bars, 0);
}

/** Bars elapsed before section `index` starts. */
export function startBar(sections: Section[], index: number): number {
  return totalBars(sections.slice(0, index));
}

/** Most common length among sections with this role; ties go to the earliest. */
export function typicalBars(sections: Section[], role: Role): number | undefined {
  const counts = new Map<number, number>();
  for (const s of sections) if (s.role === role) counts.set(s.bars, (counts.get(s.bars) ?? 0) + 1);
  let best: number | undefined;
  let bestCount = 0;
  for (const [bars, count] of counts) {
    if (count > bestCount) {
      best = bars;
      bestCount = count;
    }
  }
  return best;
}

export type RepeatPosition = "first" | "middle" | "last";

/** How a repeat compares with its role's usual length; "doubled" covers halved too. */
export type LengthChange = "same" | "longer" | "shorter" | "doubled";

/**
 * Each on-grid section of a role that repeats, with its place among them and
 * how its length compares with their most common one. Off-grid sections are R2's.
 */
export function repeats(
  sections: Section[],
  role: Role,
): { index: number; position: RepeatPosition; change: LengthChange; typical: number }[] {
  const onGrid = sections.flatMap((s, i) => (s.role === role && s.bars % 4 === 0 ? [i] : []));
  if (onGrid.length < 2) return [];
  const typical = typicalBars(onGrid.map((i) => sections[i]!), role)!;
  return onGrid.map((index, k) => {
    const bars = sections[index]!.bars;
    const position: RepeatPosition = k === 0 ? "first" : k === onGrid.length - 1 ? "last" : "middle";
    const change: LengthChange =
      bars === typical ? "same" : bars === typical * 2 || bars * 2 === typical ? "doubled" : bars > typical ? "longer" : "shorter";
    return { index, position, change, typical };
  });
}

export function formatSeconds(sec: number): string {
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
