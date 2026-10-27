/**
 * Section statistics measured from real hits, one corpus per era:
 * McGill Billboard for 1958–1991, the Harmonix Set for roughly the 1990s–2010s.
 * Rebuild with `node scripts/corpus-stats.ts <dir>`; see docs/research.md.
 */
import billboard from "./corpus/billboard.json" with { type: "json" };
import harmonix from "./corpus/harmonix.json" with { type: "json" };
import { CODE } from "./parse.ts";
import type { LengthChange, RepeatPosition } from "./stats.ts";
import type { Era, Role } from "./types.ts";

/** Fewer sections of a role than this, and its percentages are too thin to call well-supported. */
export const MIN_SAMPLE = 50;

/** A song's start, its sections, and its end, as the transition table names them. */
export type Step = Role | "start" | "end";

type Table = Record<string, Record<string, number>>;

interface Percentiles {
  n: number;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
}

interface Stats {
  /** The citation shown under a finding. */
  source: string;
  lengths: Table;
  transitions: Table;
  /**
   * "chorus:last" → how many songs have a repeat there ("songs"), and how many of
   * them keep, grow, shrink or double their role's usual length at it.
   */
  repeats: Table;
  bridgeStart: Percentiles;
  firstChorusSeconds: Percentiles;
  introSeconds: Percentiles;
  songSeconds: Percentiles;
  /** Every corpus song's total grid irregularity (`gridScores` in rules/phrase.ts), sorted. */
  songIrregularity: number[];
  /** The 75th percentile of each corpus song's highest section score: R2's warning cutoff. */
  warnScore: number;
  /**
   * Share of corpus songs with every section a whole number of 4-bar phrases, by length. Older
   * summaries lack it; the score-based share stands in until the corpus is rebuilt.
   */
  onGridSongs?: number;
}

const total = (row: Record<string, number> | undefined) => Object.values(row ?? {}).reduce((a, b) => a + b, 0);

// Plain fields, not constructor parameter properties: scripts/ runs this file under Node's type stripping.
export class Corpus {
  /** For mid-sentence use: "In the Billboard corpus, …". */
  readonly name: string;
  private readonly stats: Stats;

  constructor(name: string, stats: Stats) {
    this.name = name;
    this.stats = stats;
  }

  /** The citation shown under a finding, written by scripts/corpus-stats.ts. */
  get source(): string {
    return this.stats.source;
  }

  /** A section scoring at least this warns (below the song limit); see `severityFor` in rules/phrase.ts. */
  get warnScore(): number {
    return this.stats.warnScore;
  }

  /** How many sections of this role the corpus has. */
  sampleSize(role: Role): number {
    return total(this.stats.lengths[role]);
  }

  /**
   * Share of corpus sections of this role that are exactly `bars` long, with a
   * little smoothing so lengths the corpus never shows are rare rather than impossible.
   */
  lengthShare(role: Role, bars: number): number {
    const ALPHA = 0.5;
    const SUPPORT = 64; // the importers cap sections at 64 bars
    return ((this.stats.lengths[role]?.[String(bars)] ?? 0) + ALPHA) / (this.sampleSize(role) + ALPHA * SUPPORT);
  }

  /**
   * Share of corpus sections of this role whose length leaves `residue` bars over whole 4-bar
   * phrases. A role with too few sections to measure (codas in Harmonix, post-choruses in
   * Billboard) leans on every role's share instead, so missing the grid there still counts.
   */
  gridShare(role: Role, residue: number): number {
    const hitsIn = (row: Record<string, number> | undefined) =>
      Object.entries(row ?? {}).reduce((h, [bars, n]) => (Number(bars) % 4 === residue ? h + n : h), 0);
    const n = this.sampleSize(role);
    if (n >= MIN_SAMPLE) return (hitsIn(this.stats.lengths[role]) + 0.5) / (n + 2);
    const rows = Object.values(this.stats.lengths);
    const pooled = (rows.reduce((h, row) => h + hitsIn(row), 0) + 0.5) / (rows.reduce((t, row) => t + total(row), 0) + 2);
    return (hitsIn(this.stats.lengths[role]) + MIN_SAMPLE * pooled) / (n + MIN_SAMPLE);
  }

  /** How many corpus sections of this role (or songs, for "start") are followed by something. */
  transitionCount(from: Step): number {
    return total(this.stats.transitions[from]);
  }

  /** Share of corpus `from` steps that go straight to `to`, lightly smoothed. */
  transitionShare(from: Step, to: Step): number {
    const STEPS = Object.keys(CODE).length + 2; // every role, plus start and end
    return ((this.stats.transitions[from]?.[to] ?? 0) + 0.5) / (this.transitionCount(from) + 0.5 * STEPS);
  }

  /** What `from` most often goes to in the corpus, and how often. */
  usualNext(from: Step): { to: Step; share: number } {
    const [to, n] = Object.entries(this.stats.transitions[from] ?? {}).sort((a, b) => b[1] - a[1])[0] ?? ["end", 0];
    return { to: to as Step, share: n / Math.max(1, this.transitionCount(from)) };
  }

  /** Share of songs with repeated `role` sections whose one at `position` changes length this way. */
  repeatShare(role: Role, position: RepeatPosition, change: LengthChange): number {
    const row = this.stats.repeats[`${role}:${position}`];
    return ((row?.[change] ?? 0) + 0.5) / ((row?.songs ?? 0) + 2);
  }

  /** When the first chorus arrives, in seconds at each song's own tempo. */
  get firstChorusSeconds(): Percentiles {
    return this.stats.firstChorusSeconds;
  }

  /** Above this total irregularity, a song is more irregular than 9 in 10 corpus songs. */
  get songLimit(): number {
    const all = this.stats.songIrregularity;
    return all[Math.floor(all.length * 0.9)] ?? Infinity;
  }

  /** Share of corpus songs with every section on the 4-bar grid, by length. */
  get onGridShare(): number {
    return this.stats.onGridSongs ?? this.irregularityRank(0).atMost;
  }

  /** Share of corpus songs whose total irregularity is above `score`, and at or below it. */
  irregularityRank(score: number): { above: number; atMost: number } {
    const all = this.stats.songIrregularity;
    const above = all.filter((x) => x > score + 1e-9).length / Math.max(1, all.length);
    return { above, atMost: 1 - above };
  }

  /** How long whole songs last, in seconds at their own tempo. */
  get songSeconds(): Percentiles {
    return this.stats.songSeconds;
  }

  /** How long opening intros last, in seconds at each song's own tempo. */
  get introSeconds(): Percentiles {
    return this.stats.introSeconds;
  }

  /** Where bridges that follow two choruses start, as a fraction of the song. */
  get bridgeStart(): Percentiles {
    return this.stats.bridgeStart;
  }
}

const CORPORA: Record<Era, Corpus> = {
  classic: new Corpus("Billboard", billboard),
  modern: new Corpus("Harmonix", harmonix),
};

export const DEFAULT_ERA: Era = "modern";

export function corpusFor(era: Era = DEFAULT_ERA): Corpus {
  return CORPORA[era];
}

export const ERA_NAME: Record<Era, string> = {
  modern: "Modern hits (1990s–2010s)",
  classic: "Classic hits (1958–1991)",
};

export function formatShare(p: number): string {
  const pct = p * 100;
  return `${pct < 1 ? pct.toFixed(1) : Math.round(pct)}%`;
}
