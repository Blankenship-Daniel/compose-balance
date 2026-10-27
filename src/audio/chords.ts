import type { Role } from "../core/types.ts";

/** Triads in C major (MIDI note numbers). */
export const CHORDS: Record<string, number[]> = {
  C: [60, 64, 67],
  Dm: [62, 65, 69],
  Em: [64, 67, 71],
  F: [65, 69, 72],
  G: [67, 71, 74],
  Am: [69, 72, 76],
};

/**
 * A 4-chord loop per role, one chord per bar. Because each loop is 4 bars long,
 * an irregular section audibly cuts the loop short or repeats its start.
 */
export const LOOPS: Record<Role, string[]> = {
  intro: ["C", "F", "C", "G"],
  verse: ["Am", "F", "C", "G"],
  prechorus: ["Dm", "Em", "F", "G"],
  chorus: ["C", "G", "Am", "F"],
  postchorus: ["F", "G", "C", "C"],
  bridge: ["F", "G", "Em", "Am"],
  solo: ["Am", "F", "C", "G"],
  instrumental: ["Am", "F", "C", "G"],
  interlude: ["C", "F", "C", "G"],
  transition: ["F", "G", "F", "G"],
  outro: ["C", "F", "C", "C"],
  coda: ["F", "C", "F", "C"],
};

/** Semitones above the root for each Harte shorthand (Harte et al., ISMIR 2005). */
const SHORTHAND: Record<string, number[]> = {
  maj: [0, 4, 7],
  min: [0, 3, 7],
  dim: [0, 3, 6],
  aug: [0, 4, 8],
  maj7: [0, 4, 7, 11],
  min7: [0, 3, 7, 10],
  "7": [0, 4, 7, 10],
  dim7: [0, 3, 6, 9],
  hdim7: [0, 3, 6, 10],
  minmaj7: [0, 3, 7, 11],
  maj6: [0, 4, 7, 9],
  min6: [0, 3, 7, 9],
  "9": [0, 4, 7, 10, 14],
  maj9: [0, 4, 7, 11, 14],
  min9: [0, 3, 7, 10, 14],
  "11": [0, 4, 7, 10, 14, 17],
  min11: [0, 3, 7, 10, 14, 17],
  "13": [0, 4, 7, 10, 14, 21],
  maj13: [0, 4, 7, 11, 14, 21],
  min13: [0, 3, 7, 10, 14, 21],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  "5": [0, 7],
  "1": [0],
};

const PITCH: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const DEGREE: Record<string, number> = { "1": 0, "2": 2, "3": 4, "4": 5, "5": 7, "6": 9, "7": 11, "9": 14, "11": 17, "13": 21 };

/** "b7" → 10, "#9" → 15, "3" → 4; undefined for anything else. */
function degree(text: string): number | undefined {
  const m = /^([b#]*)(\d+)$/.exec(text);
  const base = m && DEGREE[m[2]!];
  if (base === undefined || base === null) return undefined;
  return base + [...m![1]!].reduce((n, c) => n + (c === "#" ? 1 : -1), 0);
}

/**
 * MIDI notes for a Harte chord ("A:min", "E:7(#9)", "F:maj/3", "G:sus4(b7,9)"), bass first,
 * voiced with the root between G3 and F#4. null for no chord ("N", "&pause") or one it can't read.
 */
export function harteNotes(chord: string): number[] | null {
  const m = /^([A-G])([b#]*):?([a-z0-9]*)(?:\(([^)]*)\))?(?:\/([b#]*\d+))?$/.exec(chord);
  if (!m) return null;
  const pc = (PITCH[m[1]!]! + [...m[2]!].reduce((n, c) => n + (c === "#" ? 1 : -1), 0) + 12) % 12;
  const root = 55 + ((pc - 7 + 12) % 12);
  // A bare root ("C") is a major triad; a shorthand-free list ("C:(1,3,5)") lists every note.
  const intervals = new Set(m[3] ? (SHORTHAND[m[3]] ?? SHORTHAND.maj!) : m[4] !== undefined ? [] : SHORTHAND.maj!);
  for (const item of (m[4] ?? "").split(",").map((x) => x.trim()).filter(Boolean)) {
    const d = degree(item.replace(/^\*/, ""));
    if (d === undefined) continue;
    if (item.startsWith("*")) intervals.delete(d);
    else intervals.add(d);
  }
  if (intervals.size === 0) intervals.add(0);
  const notes = [...intervals].sort((a, b) => a - b).map((i) => root + i);
  const bass = m[5] !== undefined ? degree(m[5]) : undefined;
  return bass !== undefined ? [root + (bass % 12) - 12, ...notes] : notes;
}

/**
 * One bar of a real song as timed chords: its tokens split the bar evenly, "." and "*"
 * hold the chord before (carried in from the previous bar), and "N" or "&pause" is silence.
 */
export function barChords(bar: string, carried: string | null): { chord: string | null; at: number; length: number }[] {
  const tokens = bar.split(" ").filter(Boolean);
  if (tokens.length === 0) return carried ? [{ chord: carried, at: 0, length: 1 }] : [];
  const out: { chord: string | null; at: number; length: number }[] = [];
  tokens.forEach((t, i) => {
    const chord = t === "." || t === "*" ? (out.length ? out.at(-1)!.chord : carried) : t === "N" || t === "&pause" ? null : t;
    const last = out.at(-1);
    if (last && last.chord === chord && (t === "." || t === "*")) last.length += 1 / tokens.length;
    else out.push({ chord, at: i / tokens.length, length: 1 / tokens.length });
  });
  return out;
}
