import { useEffect, useRef, useState } from "react";
import type { LatticeFace } from "@harmonics/lattice-ui";
import type { Report, Verdict as VerdictName } from "../core/types.ts";
import { useWide } from "./wide.ts";

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

/**
 * Where the song's phrase lengths rank among the era's hits: "More regular than 72% of modern hits".
 * Without the era's name when the sentence ends in the era picker instead.
 */
function gridRank(report: Report, named: boolean): string {
  const { era, moreRegularThan, onGrid, onGridShare } = report.grid;
  const pct = (p: number) => `${Math.round(p * 100)}%`;
  const of = named ? ` of ${era} hits` : " of";
  return onGrid ? `Every section on the grid, like ${pct(onGridShare)}${of}` : `More regular than ${pct(moreRegularThan)}${of}`;
}

/** The verdict, worn by the lattice face: it laughs with relief whenever an edit improves it. */
export function Verdict({
  report,
  empty,
  eraPicker,
  onOpenNotes,
  onOpenShelf,
}: {
  report: Report;
  empty: boolean;
  /** The era picker, to end the rank's sentence with; null to name the era in words. */
  eraPicker: React.ReactNode;
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

  // Drawn at the size of its box, which is smaller on a phone: larger, it spills over the verdict.
  const wide = useWide();
  const text = counts(report);
  const notes = report.findings.filter((f) => f.severity === "info").length;
  return (
    <header className="masthead">
      <h1 className="visually-hidden">Form balance</h1>
      <lattice-face className="verdict-face" mood={empty ? "asleep" : MOOD[report.verdict]} pulse={pulse} size={wide ? 56 : 44} decorative />
      <div className={`verdict verdict-${report.verdict.replace(" ", "-").toLowerCase()}`} aria-live="polite">
        <span className="verdict-word">{empty ? "Empty" : report.verdict}</span>
        {/* Nothing to fix is the verdict's status, not a way anywhere. */}
        {!empty &&
          (text === "Nothing to fix" ? (
            <span className="verdict-status">
              <lattice-icon name="done" />
              {text}
            </span>
          ) : (
            <a
              className="verdict-counts"
              href="#findings"
              onClick={(e) => {
                e.preventDefault();
                onOpenNotes();
              }}
            >
              {text}
            </a>
          ))}
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
        {!empty && (
          <span
            className="verdict-rank"
            title={`Phrase lengths against the ${report.grid.corpus} corpus: how many of its songs are further off the 4-bar grid than this one`}
          >
            {gridRank(report, !eraPicker)}
            {eraPicker && <> {eraPicker}</>}
          </span>
        )}
      </div>
    </header>
  );
}

/** The rank on its own, for a phone's toolbar row: there it has room for two lines. */
export function VerdictRank({ report, empty }: { report: Report; empty: boolean }) {
  if (empty) return null;
  return <span className="toolbar-rank">{gridRank(report, true)}</span>;
}

/**
 * The verdict in short, for a phone's stuck toolbar once the masthead has scrolled away: the
 * word and its counts on one line, a link to the notes as in the masthead.
 */
export function VerdictLine({ report, empty, onOpenNotes }: { report: Report; empty: boolean; onOpenNotes(): void }) {
  if (empty) return null;
  const text = counts(report);
  return (
    <span className={`verdict-line verdict-${report.verdict.replace(" ", "-").toLowerCase()}`}>
      <span className="verdict-line-word">{report.verdict}</span>
      {text === "Nothing to fix" ? (
        <span className="verdict-line-counts">{text}</span>
      ) : (
        <button className="verdict-line-counts" onClick={onOpenNotes}>
          {text}
        </button>
      )}
    </span>
  );
}
