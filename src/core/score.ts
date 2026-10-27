import { FOUR_FOUR } from "./meter.ts";
import { classify, FORM_NAME } from "./classify.ts";
import { gridScores, irregularity, lengthRule, mismatchRule } from "./rules/phrase.ts";
import { corpusFor, DEFAULT_ERA } from "./corpus.ts";
import { macroRules } from "./rules/macro.ts";
import { secondsFor, totalBars } from "./stats.ts";
import type { Options, Report, Section, Severity, Verdict } from "./types.ts";

export const DEFAULT_OPTIONS: Options = { bpm: 100, meter: FOUR_FOUR };

const ORDER: Record<Severity, number> = { problem: 0, warning: 1, info: 2 };

export function analyze(sections: Section[], opts: Options = DEFAULT_OPTIONS): Report {
  const formType = classify(sections);
  const findings = [...lengthRule(sections, opts.era), ...mismatchRule(sections, opts.era), ...macroRules(sections, formType, opts)].sort(
    (a, b) => ORDER[a.severity] - ORDER[b.severity],
  );

  const problems = findings.filter((f) => f.severity === "problem");
  const warnings = findings.filter((f) => f.severity === "warning");
  const verdict: Verdict = problems.length ? "Unbalanced" : warnings.length ? "Mostly balanced" : "Balanced";

  let summary: string;
  if (sections.length === 0) summary = "Add some sections to get started.";
  else if (problems.length) summary = problems.map((f) => f.title).join("; ") + ".";
  else if (warnings.length)
    summary = `${warnings.length} thing${warnings.length === 1 ? "" : "s"} to look at: ${warnings.map((f) => f.title.toLowerCase()).join("; ")}.`;
  else summary = `Every section sits on the 4-bar phrase grid, and the sections come in a conventional order for ${FORM_NAME[formType].replace(/ \(.*\)$/, "").toLowerCase().replace("aaba", "AABA")} form.`;

  const bars = totalBars(sections);
  const era = opts.era ?? DEFAULT_ERA;
  const corpus = corpusFor(era);
  const irregular = gridScores(sections, corpus).total;
  const grid = {
    corpus: corpus.name,
    era,
    moreRegularThan: corpus.irregularityRank(irregular).above,
    // By length, not score: an odd section can score 0 where its role is rarely on the grid anyway (codas).
    onGrid: sections.every((s) => s.intentional || irregularity(s.bars) === 0),
    onGridShare: corpus.onGridShare,
  };
  return { formType, verdict, summary, totalBars: bars, seconds: secondsFor(bars, opts), findings, grid };
}
