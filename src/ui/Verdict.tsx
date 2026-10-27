import { useEffect, useRef, useState } from "react";
import type { LatticeFace } from "@harmonics/lattice-ui";
import type { Report, Verdict as VerdictName } from "../core/types.ts";

const MOOD: Record<VerdictName, LatticeFace["mood"]> = {
  Balanced: "happy",
  "Mostly balanced": "puzzled",
  Unbalanced: "distressed",
};

const RANK: Record<VerdictName, number> = { Unbalanced: 0, "Mostly balanced": 1, Balanced: 2 };

/** "1 to fix, 2 to look at": the counts behind the verdict, not a repeat of the findings. */
function counts(report: Report): string {
  const n = (sev: string) => report.findings.filter((f) => f.severity === sev).length;
  const parts = [n("problem") && `${n("problem")} to fix`, n("warning") && `${n("warning")} to look at`].filter(Boolean);
  return parts.length ? parts.join(", ") : "Nothing to fix";
}

/** The verdict, worn by the lattice face: it laughs with relief whenever an edit improves it. */
export function Verdict({
  report,
  empty,
  onOpenNotes,
  onOpenShelf,
}: {
  report: Report;
  empty: boolean;
  onOpenNotes(): void;
  /** Opens the notes that aren't problems: things worth knowing, not fixing. */
  onOpenShelf(): void;
}) {
  const [pulse, setPulse] = useState(0);
  const last = useRef<number | null>(null);
  const rank = empty ? null : RANK[report.verdict];

  useEffect(() => {
    if (rank !== null && last.current !== null && rank > last.current) setPulse((p) => p + 1);
    last.current = rank;
  }, [rank]);

  const text = counts(report);
  const notes = report.findings.filter((f) => f.severity === "info").length;
  return (
    <header className="masthead">
      <h1 className="visually-hidden">Form balance</h1>
      <lattice-face className="verdict-face" mood={empty ? "asleep" : MOOD[report.verdict]} pulse={pulse} size={56} decorative />
      <div className={`verdict verdict-${report.verdict.replace(" ", "-").toLowerCase()}`} aria-live="polite">
        <span className="verdict-word">{empty ? "Empty" : report.verdict}</span>
        {!empty && (
          <a
            className="verdict-counts"
            href="#findings"
            onClick={(e) => {
              e.preventDefault();
              onOpenNotes();
            }}
          >
            {text === "Nothing to fix" && <lattice-icon name="done" />}
            {text}
          </a>
        )}
        {!empty && notes > 0 && (
          <a
            className="verdict-counts"
            href="#findings"
            onClick={(e) => {
              e.preventDefault();
              onOpenShelf();
            }}
          >
            {notes} {notes === 1 ? "note" : "notes"}
          </a>
        )}
      </div>
    </header>
  );
}
