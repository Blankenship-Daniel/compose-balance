import { FOUR_FOUR } from "./meter.ts";
import { classify, FORM_NAME } from "./classify.ts";
import { lengthRule, mismatchRule } from "./rules/phrase.ts";
import { macroRules } from "./rules/macro.ts";
import { secondsFor, totalBars } from "./stats.ts";
import type { Options, Report, Section, Severity, Verdict } from "./types.ts";

export const DEFAULT_OPTIONS: Options = { bpm: 100, meter: FOUR_FOUR };

const ORDER: Record<Severity, number> = { problem: 0, warning: 1, info: 2 };

export function analyze(sections: Section[], opts: Options = DEFAULT_OPTIONS): Report {
  const formType = classify(sections);
  const findings = [...lengthRule(sections), ...mismatchRule(sections), ...macroRules(sections, formType, opts)].sort(
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
  return { formType, verdict, summary, totalBars: bars, seconds: secondsFor(bars, opts), findings };
}
