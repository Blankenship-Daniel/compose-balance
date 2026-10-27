import { type Corpus, corpusFor, DEFAULT_ERA, formatShare, MIN_SAMPLE } from "../corpus.ts";
import { NAME } from "../parse.ts";
import { markIntentional, setBars } from "../fixes.ts";
import { repeats, typicalBars } from "../stats.ts";
import type { Era, Finding, Fix, Role, Section, Severity } from "../types.ts";

const PHRASE_SOURCE =
  "Rothstein, Phrase Rhythm in Tonal Music (1989); Love, MTO 21.3 (2015); Pattison, Writing Better Lyrics";

/** 0 = on the 4-bar grid, 1 = half a phrase off (2, 6, 10 bars), 2 = odd. */
export function irregularity(bars: number): number {
  if (bars % 4 === 0) return 0;
  return bars % 2 === 0 ? 1 : 2;
}

/**
 * How rare it is for this role to miss the grid the way `bars` does (a bar
 * short, a bar long, half a phrase), in bits against landing on it: 1 bit is
 * half as common, 3 bits an eighth as common. Measured from the corpus.
 */
export function rarity(corpus: Corpus, role: Role, bars: number): number {
  return Math.max(0, Math.log2(corpus.gridShare(role, 0) / corpus.gridShare(role, bars % 4)));
}

/**
 * How much an irregular length hurts in this role. Choruses and the last verse
 * are arrival points; pre-choruses and bridges are expected to push
 * forward, so instability there reads as motion (Pattison).
 */
function roleWeight(sections: Section[], i: number): number {
  const s = sections[i]!;
  switch (s.role) {
    case "chorus":
      return 1.5;
    case "verse": {
      const lastVerse = sections.findLastIndex((x) => x.role === "verse");
      return i === lastVerse && sections.filter((x) => x.role === "verse").length > 1 ? 1.5 : 1;
    }
    case "intro":
    case "outro":
    case "coda":
      return 0.25;
    default:
      return 0.5;
  }
}

/**
 * A section's score is rarity × role weight. One odd section is ordinary:
 * most hits have some. A song only reads as unbalanced when its odd sections
 * add up to more than 9 in 10 of the era's hits do (`Corpus.songLimit`).
 * Below that, a section only warns when it is more irregular than the most
 * irregular section of 3 in 4 of the era's hits (`Corpus.warnScore`). Modern
 * hits keep closer to the grid, so the same length scores higher against them,
 * and their cutoff is higher to match.
 */
function severityFor(score: number, songScore: number, corpus: Corpus): Severity {
  if (score < 1.25) return "info";
  if (songScore > corpus.songLimit) return "problem";
  return score >= corpus.warnScore ? "warning" : "info";
}

function gridNote(bars: number): string {
  const r = bars % 4;
  const lower = bars - r;
  if (r === 3) return `${bars} bars is one bar short of ${lower + 4}, so the next section lands a bar early.`;
  if (r === 1) return `${bars} bars is one bar more than ${lower}, so the listener waits an extra bar for the next downbeat.`;
  return `${bars} bars is half a 4-bar phrase off the grid.`;
}

function roleNote(role: Role, weight: number): string {
  if (weight >= 1.5)
    return `The ${NAME[role].toLowerCase()} is an arrival point. Listeners expect it to feel settled, so an irregular length here reads as a stumble rather than a choice.`;
  if (weight >= 1) return "Verses carry the story; an irregular verse is noticeable but tolerable.";
  if (weight >= 0.5)
    return `Irregular lengths in a ${NAME[role].toLowerCase()} often feel like useful forward push, so this is mild.`;
  return "Intros, outros and codas sit outside the main phrase structure; listeners re-anchor when the verse starts.";
}

function lengthTargets(bars: number, typical: number | undefined): number[] {
  const out: number[] = [];
  if (typical !== undefined && irregularity(typical) === 0) out.push(typical);
  const down = bars - (bars % 4);
  const up = down + 4;
  const candidates = [up, down].filter((n) => n > 0).sort((a, b) => Math.abs(a - bars) - Math.abs(b - bars));
  for (const n of candidates) {
    if (Math.abs(n - bars) <= 2 || out.length === 0) if (!out.includes(n)) out.push(n);
  }
  return out;
}

/**
 * Each section's score (0 on the grid), the irregular neighbours that
 * compensate each other, and the song's total, which `!` sections stay out of.
 * The corpus script scores every corpus song with this too.
 */
export function gridScores(sections: Section[], corpus: Corpus): { scores: number[]; compensated: Set<number>; total: number } {
  const scores = sections.map((s, i) => (irregularity(s.bars) ? rarity(corpus, s.role, s.bars) * roleWeight(sections, i) : 0));
  const compensated = new Set<number>();
  // Two irregular neighbours that add up to whole 4-bar phrases (7 + 5, 6 + 2)
  // put the song back on the grid, so each one hurts less.
  for (let i = 0; i + 1 < sections.length; i++) {
    const a = sections[i]!.bars;
    const b = sections[i + 1]!.bars;
    if (irregularity(a) && irregularity(b) && (a + b) % 4 === 0) {
      compensated.add(i);
      compensated.add(i + 1);
    }
  }
  const total = sections.reduce((sum, s, i) => (s.intentional ? sum : sum + scores[i]! * (compensated.has(i) ? 0.5 : 1)), 0);
  return { scores, compensated, total };
}

/** R1–R3: section lengths against the 4-bar hypermeter, scored against the era's hits and weighted by role. */
export function lengthRule(sections: Section[], era: Era = DEFAULT_ERA): Finding[] {
  const corpus = corpusFor(era);
  const { scores, compensated, total: songScore } = gridScores(sections, corpus);

  const groups = new Map<string, number[]>();
  sections.forEach((s, i) => {
    if (!irregularity(s.bars)) return;
    const key = `${s.role}:${s.bars}:${s.intentional}:${compensated.has(i)}`;
    groups.set(key, [...(groups.get(key) ?? []), i]);
  });

  const findings: Finding[] = [];
  for (const indexes of groups.values()) {
    const first = sections[indexes[0]!]!;
    const weight = Math.max(...indexes.map((i) => roleWeight(sections, i)));
    const score = Math.max(...indexes.map((i) => scores[i]!));
    const isCompensated = compensated.has(indexes[0]!);

    const share = corpus.lengthShare(first.role, first.bars);
    const why = [
      gridNote(first.bars),
      `In the ${corpus.name} corpus, ${formatShare(share)} of ${pluralName(first.role)} are ${first.bars} bars.`,
      roleNote(first.role, weight),
    ];
    if (isCompensated) why.push("It pairs with a neighbouring irregular section to make whole 4-bar phrases, which softens the effect.");

    let severity = severityFor(score, songScore, corpus);
    if (severity === "problem")
      why.push(`Together with the song's other odd lengths, this adds up to more irregularity than 90% of ${corpus.name} corpus songs have.`);
    else if (severity === "info" && score >= 1.25)
      why.push(`At least 1 in 4 ${corpus.name} corpus songs has a section this far off the grid, so this is a note rather than a warning.`);
    if (isCompensated) severity = severity === "problem" ? "warning" : "info";
    if (first.intentional) {
      severity = "info";
      why.push(
        first.bars % 4 === 3
          ? "Marked as on purpose: a short section feels urgent, as if the next part interrupts it. Elide the last bar into the next downbeat to make it sound deliberate."
          : "Marked as on purpose: a long section feels like a held breath. Use the extra bar for a turnaround, fill or vocal tag so it sounds deliberate.",
      );
    }

    const count = indexes.length;
    const label = `${first.bars}-bar ${lowerName(first.role)}${count > 1 ? ` (×${count})` : ""}`;
    const targets = lengthTargets(first.bars, typicalRegular(sections, first.role));
    // The buttons say what changes; how to play the change goes in the note.
    if (targets.some((bars) => bars > first.bars)) why.push("To lengthen it, add a turnaround or vocal tag.");
    if (targets.some((bars) => bars < first.bars)) why.push("To shorten it, cut a bar.");
    const fixes: Fix[] = targets.map((bars) => ({
      label: `Make ${count > 1 ? "them" : "it"} ${bars} bars`,
      sections: setBars(sections, indexes, bars),
    }));
    if (!first.intentional)
      fixes.push({ label: "Keep it, it’s on purpose", sections: markIntentional(sections, indexes) });

    findings.push({
      rule: "R2",
      severity,
      basis: corpus.sampleSize(first.role) >= MIN_SAMPLE ? "well-supported" : "convention",
      title: `${label} breaks the 4-bar phrase grid`,
      why: why.join(" "),
      source: `${PHRASE_SOURCE}; ${corpus.source}`,
      sectionIndexes: indexes,
      // An odd length is felt where the section hands over: the next one lands early or late.
      boundaries: indexes.filter((i) => i < sections.length - 1),
      fixes,
    });
  }
  return findings;
}

export function pluralName(role: Role): string {
  const name = lowerName(role);
  return name.endsWith("s") ? `${name}es` : `${name}s`;
}

/** Role name for use mid-sentence. */
function lowerName(role: Role): string {
  return NAME[role].toLowerCase();
}

function typicalRegular(sections: Section[], role: Role): number | undefined {
  return typicalBars(
    sections.filter((s) => irregularity(s.bars) === 0),
    role,
  );
}

/** Below this share of corpus songs, a repeat's length change is unusual enough to warn about. */
const RARE_CHANGE = 0.03;

/**
 * R4: repeated sections of the same type usually match in length. How much a
 * change stands out depends on where it is: hits often stretch the last chorus
 * or trim the last verse, but rarely the first. Measured from the corpus.
 */
export function mismatchRule(sections: Section[], era: Era = DEFAULT_ERA): Finding[] {
  const corpus = corpusFor(era);
  const findings: Finding[] = [];
  for (const role of ["verse", "prechorus", "chorus"] as const) {
    const changed = repeats(sections, role).filter(
      // A final chorus repeated whole (double or triple chorus, tag) is a convention, not an imbalance.
      (r) => {
        const bars = sections[r.index]!.bars;
        const repeatedWhole = role === "chorus" && r.position === "last" && bars > r.typical && bars % r.typical === 0;
        return r.change !== "same" && !repeatedWhole;
      },
    );

    const groups = new Map<string, typeof changed>();
    for (const r of changed) {
      const key = `${sections[r.index]!.bars}:${r.position}`;
      groups.set(key, [...(groups.get(key) ?? []), r]);
    }
    for (const group of groups.values()) {
      const { position, change, typical } = group[0]!;
      const idx = group.map((r) => r.index);
      const bars = sections[idx[0]!]!.bars;
      const name = lowerName(role);
      const share = corpus.repeatShare(role, position, change);
      const severity: Severity = change !== "doubled" && share < RARE_CHANGE ? "warning" : "info";
      const how = change === "doubled" ? (bars > typical ? "doubled" : "halved") : change;
      const why = [
        change === "doubled"
          ? `A ${how} ${name} keeps the 4-bar grid, so it still feels balanced. Listeners do notice it, so make sure the change is on purpose.`
          : `Repeated sections set up an expectation of their own length. A ${bars}-bar ${name} after ${typical}-bar ones lands on a different phrase boundary than the ear predicts.`,
        `In the ${corpus.name} corpus, ${position === "middle" ? "a middle" : `the ${position}`} ${name} is ${change === "doubled" ? "doubled or halved" : `${how} than the others`} in ${formatShare(share)} of songs with more than one.`,
      ];
      findings.push({
        rule: "R4",
        severity,
        basis: corpus.sampleSize(role) >= MIN_SAMPLE ? "convention" : "speculative",
        title: `${NAME[role]} length changes: ${bars} bars vs the usual ${typical}`,
        why: why.join(" "),
        source: `Pattison, Writing Better Lyrics (repetition and expectation); ${corpus.source}`,
        sectionIndexes: idx,
        fixes: [{ label: `Make ${idx.length > 1 ? "them" : "it"} ${typical} bars`, sections: setBars(sections, idx, typical) }],
      });
    }
  }
  return findings;
}
