import type { Meter } from "./meter.ts";

/** Section functions, taken from the SALAMI function vocabulary (see docs/research.md). */
export type Role =
  | "intro"
  | "verse"
  | "prechorus"
  | "chorus"
  | "postchorus"
  | "bridge"
  | "solo"
  | "instrumental"
  | "interlude"
  | "transition"
  | "outro"
  | "coda";

export interface Section {
  role: Role;
  bars: number;
  /** Marked with "!" in notation: the irregularity is a deliberate choice. */
  intentional: boolean;
}

export type FormType =
  | "verse-chorus"
  | "verse-prechorus-chorus"
  | "aaba"
  | "strophic"
  | "12-bar-blues"
  | "unknown";

/** Which hits the rules compare against (see corpus.ts). */
export type Era = "classic" | "modern";

export interface Options {
  bpm: number;
  meter: Meter;
  /** Defaults to DEFAULT_ERA. */
  era?: Era;
}

export type Severity = "problem" | "warning" | "info";

/** How much evidence stands behind a rule (see docs/research.md). */
export type Basis = "well-supported" | "convention" | "speculative";

export interface Fix {
  label: string;
  sections: Section[];
}

export interface Finding {
  rule: string;
  severity: Severity;
  basis: Basis;
  title: string;
  why: string;
  source: string;
  sectionIndexes: number[];
  /**
   * The hand-offs this finding is about: `i` is the move from section i into section i + 1.
   * Lets the table colour the thread between sections where a problem sits.
   */
  boundaries?: number[];
  fixes: Fix[];
}

export type Verdict = "Balanced" | "Mostly balanced" | "Unbalanced";

export interface Report {
  formType: FormType;
  verdict: Verdict;
  summary: string;
  totalBars: number;
  seconds: number;
  findings: Finding[];
  /** How the song's grid irregularity ranks among the era's hits. */
  grid: {
    /** Corpus name, e.g. "Harmonix". */
    corpus: string;
    era: Era;
    /** Share of the era's hits more irregular than this song. */
    moreRegularThan: number;
    /** Every section sits on the 4-bar grid (intentional ones aside). */
    onGrid: boolean;
    /** Share of the era's hits with every section on the grid. */
    onGridShare: number;
  };
}
