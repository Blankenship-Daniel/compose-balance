import type { Section } from "./types.ts";

export function setBars(sections: Section[], indexes: number[], bars: number): Section[] {
  return sections.map((s, i) => (indexes.includes(i) ? { ...s, bars, intentional: false } : s));
}

export function markIntentional(sections: Section[], indexes: number[]): Section[] {
  return sections.map((s, i) => (indexes.includes(i) ? { ...s, intentional: true } : s));
}

export function insertAt(sections: Section[], index: number, section: Section): Section[] {
  return [...sections.slice(0, index), section, ...sections.slice(index)];
}

export function move(sections: Section[], from: number, to: number): Section[] {
  const out = [...sections];
  const [s] = out.splice(from, 1);
  out.splice(to > from ? to - 1 : to, 0, s!);
  return out;
}

/** Index of the section the song ends on, ignoring a trailing outro. */
export function lastBodyIndex(sections: Section[]): number {
  let i = sections.length - 1;
  while (i > 0 && sections[i]!.role === "outro") i--;
  return i;
}

/** Cuts section `index` down to its first `bars` bars (the shears' prune); 0 or less removes it. */
export function pruneAt(sections: Section[], index: number, bars: number): Section[] {
  const s = sections[index];
  if (!s) return sections;
  if (bars <= 0) return sections.filter((_, i) => i !== index);
  if (bars >= s.bars) return sections;
  return setBars(sections, [index], bars);
}
