import { CORPUS_SOURCE, formatShare, gridShare, lengthShare, MIN_SAMPLE, sampleSize } from "../corpus.ts";
import { NAME } from "../parse.ts";
import { markIntentional, setBars } from "../fixes.ts";
import { typicalBars } from "../stats.ts";
import type { Finding, Fix, Role, Section, Severity } from "../types.ts";

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
export function rarity(role: Role, bars: number): number {
  return Math.max(0, Math.log2(gridShare(role, 0) / gridShare(role, bars % 4)));
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
 * add up to more than this, which 90% of corpus songs stay under (see the
 * corpus check in __tests__/corpus-eval.test.ts).
 */
const SONG_LIMIT = 16;

function severityFor(score: number, songScore: number): Severity {
  if (score < 1.25) return "info";
  return songScore >= SONG_LIMIT ? "problem" : "warning";
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

/** R1–R3: section lengths against the 4-bar hypermeter, weighted by role. */
export function lengthRule(sections: Section[]): Finding[] {
  const scores = sections.map((s, i) => (irregularity(s.bars) ? rarity(s.role, s.bars) * roleWeight(sections, i) : 0));
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
  const songScore = sections.reduce(
    (sum, s, i) => (s.intentional ? sum : sum + scores[i]! * (compensated.has(i) ? 0.5 : 1)),
    0,
  );

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

    const share = lengthShare(first.role, first.bars);
    const why = [
      gridNote(first.bars),
      `In the Billboard corpus, ${formatShare(share)} of ${pluralName(first.role)} are ${first.bars} bars.`,
      roleNote(first.role, weight),
    ];
    if (isCompensated) why.push("It pairs with a neighbouring irregular section to make whole 4-bar phrases, which softens the effect.");

    let severity = severityFor(score, songScore);
    if (severity === "problem")
      why.push("Together with the song's other odd lengths, this adds up to more irregularity than 90% of the corpus songs have.");
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
      basis: sampleSize(first.role) >= MIN_SAMPLE ? "well-supported" : "convention",
      title: `${label} breaks the 4-bar phrase grid`,
      why: why.join(" "),
      source: `${PHRASE_SOURCE}; ${CORPUS_SOURCE}`,
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

/** R4: repeated sections of the same type should usually match in length. */
export function mismatchRule(sections: Section[]): Finding[] {
  const findings: Finding[] = [];
  for (const role of ["verse", "prechorus", "chorus"] as const) {
    const indexes = sections.flatMap((s, i) => (s.role === role ? [i] : []));
    if (indexes.length < 2) continue;
    const typical = typicalRegular(sections, role);
    if (typical === undefined) continue;
    const lastIndex = indexes[indexes.length - 1]!;
    const deviants = indexes.filter((i) => {
      const bars = sections[i]!.bars;
      if (bars === typical || irregularity(bars)) return false; // irregular ones are covered by R2
      // An extended final chorus (double chorus, tag) is a convention, not an imbalance.
      if (i === lastIndex && role === "chorus" && bars > typical && bars % typical === 0) return false;
      return true;
    });
    if (deviants.length === 0) continue;

    const byBars = new Map<number, number[]>();
    for (const i of deviants) byBars.set(sections[i]!.bars, [...(byBars.get(sections[i]!.bars) ?? []), i]);
    for (const [bars, idx] of byBars) {
      const ratio = bars / typical;
      const doubled = ratio === 2 || ratio === 0.5;
      findings.push({
        rule: "R4",
        severity: doubled ? "info" : "warning",
        basis: "speculative",
        title: `${NAME[role]} length changes: ${bars} bars vs the usual ${typical}`,
        why: doubled
          ? `A ${ratio === 2 ? "doubled" : "halved"} ${NAME[role].toLowerCase()} keeps the 4-bar grid, so it still feels balanced. Listeners do notice it, so make sure the change is on purpose.`
          : `Repeated sections set up an expectation of their own length. A ${bars}-bar ${NAME[role].toLowerCase()} after ${typical}-bar ones lands on a different phrase boundary than the ear predicts.`,
        source: "Pattison, Writing Better Lyrics (repetition and expectation); extension of the hypermeter norm",
        sectionIndexes: idx,
        fixes: [{ label: `Make ${idx.length > 1 ? "them" : "it"} ${typical} bars`, sections: setBars(sections, idx, typical) }],
      });
    }
  }
  return findings;
}
