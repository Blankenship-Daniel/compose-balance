/** Time signatures, including odd and additive meters like 7/8 or 2+2+3/8. */
export interface Meter {
  /** Top number: notes of `unit` length per bar. */
  beats: number;
  /** Bottom number: 1, 2, 4, 8, 16 or 32. */
  unit: number;
  /** How the beats group into felt pulses; sums to `beats`. [1,1,1,1] for 4/4, [3,3] for 6/8, [2,2,3] for 7/8. */
  groups: number[];
}

/** Offered as suggestions; any other meter can be typed. */
export const COMMON_METERS = ["4/4", "3/4", "2/4", "2/2", "6/8", "12/8", "9/8", "5/4", "7/4", "5/8", "7/8"];

export const FOUR_FOUR: Meter = { beats: 4, unit: 4, groups: [1, 1, 1, 1] };

const UNITS = [1, 2, 4, 8, 16, 32];

/**
 * How beats group when the meter doesn't say. Compound eighths (6/8, 9/8, 12/8)
 * group in threes; odd eighths (5/8, 7/8, 11/8) in twos ending with a three,
 * the most common reading. Quarter-note meters count every beat.
 */
export function defaultGroups(beats: number, unit: number): number[] {
  if (unit >= 8 && beats > 3 && beats % 3 === 0) return Array(beats / 3).fill(3);
  if (unit >= 8 && beats > 4 && beats % 2 === 1) return [...Array((beats - 3) / 2).fill(2), 3];
  return Array(beats).fill(1);
}

/** Compound meters: every group is a dotted note of three units (6/8, 9/8, 12/8). */
export function isCompound(m: Meter): boolean {
  return m.unit >= 8 && m.groups.length > 1 && m.groups.every((g) => g === 3);
}

/**
 * Beats the tempo counts per bar. Compound meters count dotted notes (6/8 at
 * 60 bpm is two dotted quarters a second); everything else counts the bottom
 * number, so 7/8 at 210 bpm counts eighth notes.
 */
export function pulsesPerBar(m: Meter): number {
  return isCompound(m) ? m.groups.length : m.beats;
}

/** The note the tempo counts, as a chart would mark it (♩ = 120). */
export function tempoNote(m: Meter): { symbol: string; name: string } {
  const names: Record<number, string> = { 1: "whole", 2: "half", 4: "quarter", 8: "eighth", 16: "sixteenth", 32: "thirty-second" };
  const symbols: Record<number, string> = { 1: "𝅝", 2: "𝅗𝅥", 4: "♩", 8: "♪", 16: "𝅘𝅥𝅯", 32: "𝅘𝅥𝅰" };
  if (isCompound(m)) {
    const dotted = m.unit / 2;
    return { symbol: `${symbols[dotted] ?? ""}.`, name: `dotted ${names[dotted]}` };
  }
  return { symbol: symbols[m.unit] ?? "", name: names[m.unit] ?? `1/${m.unit}` };
}

/** Parses "7/8", "12/8" or "2+2+3/8". Returns an error message for anything else. */
export function parseMeter(text: string): Meter | string {
  const m = /^\s*(\d+(?:\s*\+\s*\d+)*)\s*\/\s*(\d+)\s*$/.exec(text);
  if (!m) return "Write a time signature as top/bottom, like 7/8, or with groups, like 2+2+3/8.";
  const unit = Number(m[2]);
  if (!UNITS.includes(unit)) return "The bottom number must be 1, 2, 4, 8, 16 or 32.";
  const parts = m[1]!.split("+").map((p) => Number(p.trim()));
  if (parts.some((p) => p < 1)) return "Each group needs at least one beat.";
  const beats = parts.reduce((a, b) => a + b, 0);
  if (beats > 32) return "Use at most 32 beats per bar.";
  return { beats, unit, groups: parts.length > 1 ? parts : defaultGroups(beats, unit) };
}

export function formatMeter(m: Meter): string {
  const custom = m.groups.join("+") !== defaultGroups(m.beats, m.unit).join("+");
  return `${custom ? m.groups.join("+") : m.beats}/${m.unit}`;
}
