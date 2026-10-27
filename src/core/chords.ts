import type { Section } from "./types.ts";

/**
 * Keeps a real song's chords on their sections through an edit that rebuilds the
 * section list (the table, the text box). A section without chords takes those of
 * the nearest unclaimed old section of its role, one of the same length first, so
 * moving, resizing or adding a section never slides chords onto other bars.
 */
export function carryChords(prev: Section[], next: Section[]): Section[] {
  if (!prev.some((s) => s.chords)) return next;
  const claimed = new Set<number>();
  // Sections an edit copied over keep what they have.
  for (const s of next) if (s.chords) claimed.add(prev.findIndex((p) => p.chords === s.chords));

  const out = [...next];
  const claim = (sameLength: boolean) =>
    out.forEach((s, i) => {
      if (s.chords) return;
      let best = -1;
      prev.forEach((p, j) => {
        if (!p.chords || claimed.has(j) || p.role !== s.role || (sameLength && p.bars !== s.bars)) return;
        if (best < 0 || Math.abs(j - i) < Math.abs(best - i)) best = j;
      });
      if (best < 0) return;
      claimed.add(best);
      out[i] = { ...s, chords: prev[best]!.chords };
    });
  claim(true);
  claim(false);
  return out;
}
