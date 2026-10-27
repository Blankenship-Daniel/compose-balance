/**
 * Section statistics measured from the McGill Billboard corpus.
 * Rebuild with `node scripts/corpus-stats.ts <billboard-dir>`; see docs/research.md.
 */
import stats from "./corpus/billboard.json" with { type: "json" };
import type { Role } from "./types.ts";

export const CORPUS_SOURCE = "McGill Billboard corpus (Burgoyne, Wild & Fujinaga, ISMIR 2011), 739 Hot 100 songs, 1958–1991";

/** Fewer sections of a role than this, and its percentages are too thin to call well-supported. */
export const MIN_SAMPLE = 50;

const lengths = stats.lengths as Record<string, Record<string, number>>;

/** How many sections of this role the corpus has. */
export function sampleSize(role: Role): number {
  return Object.values(lengths[role] ?? {}).reduce((a, b) => a + b, 0);
}

/**
 * Share of corpus sections of this role that are exactly `bars` long, with a
 * little smoothing so lengths the corpus never shows are rare rather than impossible.
 */
export function lengthShare(role: Role, bars: number): number {
  const ALPHA = 0.5;
  const SUPPORT = 64; // the importer caps sections at 64 bars
  return ((lengths[role]?.[String(bars)] ?? 0) + ALPHA) / (sampleSize(role) + ALPHA * SUPPORT);
}

/** Share of corpus sections of this role whose length leaves `residue` bars over whole 4-bar phrases. */
export function gridShare(role: Role, residue: number): number {
  let hits = 0;
  for (const [bars, n] of Object.entries(lengths[role] ?? {})) if (Number(bars) % 4 === residue) hits += n;
  return (hits + 0.5) / (sampleSize(role) + 2);
}

const transitions = stats.transitions as Record<string, Record<string, number>>;

/** A song's start, its sections, and its end, as the transition table names them. */
export type Step = Role | "start" | "end";

/** How many corpus sections of this role (or songs, for "start") are followed by something. */
export function transitionCount(from: Step): number {
  return Object.values(transitions[from] ?? {}).reduce((a, b) => a + b, 0);
}

/** Share of corpus `from` steps that go straight to `to`, lightly smoothed. */
export function transitionShare(from: Step, to: Step): number {
  const STEPS = 13; // 11 roles, plus start and end
  return ((transitions[from]?.[to] ?? 0) + 0.5) / (transitionCount(from) + 0.5 * STEPS);
}

/** What `from` most often goes to in the corpus, and how often. */
export function usualNext(from: Step): { to: Step; share: number } {
  const [to, n] = Object.entries(transitions[from] ?? {}).sort((a, b) => b[1] - a[1])[0] ?? ["end", 0];
  return { to: to as Step, share: n / Math.max(1, transitionCount(from)) };
}

/** Where bridges that follow two choruses start, as a fraction of the song. */
export const bridgeStart = stats.bridgeStart;

export function formatShare(p: number): string {
  const pct = p * 100;
  return `${pct < 1 ? pct.toFixed(1) : Math.round(pct)}%`;
}
