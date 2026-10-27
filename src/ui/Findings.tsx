import type { Basis, Finding, Section, Severity } from "../core/types.ts";

const HEADINGS: Record<Severity, string> = {
  problem: "Needs fixing",
  warning: "Worth a look",
  info: "Notes",
};

const BASIS: Record<Basis, string> = {
  "well-supported": "Well supported by research",
  convention: "Songwriting convention",
  speculative: "Rule of thumb, little evidence",
};

/** Splits "First sentence. The rest…" so a note leads with one line. */
function firstSentence(text: string): [string, string] {
  const m = /^(.+?[.!?])\s+(?=[A-Z0-9"“])/.exec(text);
  return m ? [m[1]!, text.slice(m[0].length)] : [text, ""];
}

/** One finding: what is off, why in one line, the fixes, and the rest under More. */
export function NoteCard({ finding: f, onApply }: { finding: Finding; onApply(next: Section[]): void }) {
  const [lead, rest] = firstSentence(f.why);
  return (
    <>
      <h3>{f.title}</h3>
      <p>{lead}</p>
      {f.fixes.length > 0 && (
        <div className="fixes">
          {f.fixes.map((fix) => (
            <button key={fix.label} onClick={() => onApply(fix.sections)}>
              {fix.label}
            </button>
          ))}
        </div>
      )}
      <details className="more">
        <summary>More</summary>
        {rest && <p>{rest}</p>}
        <p className="provenance">
          {BASIS[f.basis]}. Sources: {f.source}
        </p>
      </details>
    </>
  );
}

interface Props {
  findings: Finding[];
  empty: boolean;
  onApply(next: Section[]): void;
  onHover(indexes: number[]): void;
  onJump(indexes: number[]): void;
}

export function Findings({ findings, empty, onApply, onHover, onJump }: Props) {
  if (empty) return <p className="notes-empty">Add sections and notes about balance will appear here.</p>;
  if (findings.length === 0)
    return (
      <p className="notes-empty">
        Nothing to fix. Every section fills its phrases and the order is conventional. Try taking a bar off a chorus
        to hear what imbalance sounds like.
      </p>
    );

  return (
    <>
      {(["problem", "warning", "info"] as const).map((severity) => {
        const group = findings.filter((f) => f.severity === severity);
        if (group.length === 0) return null;
        const heading = (
          <>
            {HEADINGS[severity]} <span className="count">({group.length})</span>
          </>
        );
        const items = group.map((f, i) => (
              <article
                key={`${f.rule}-${i}-${f.title}`}
                className="note"
                tabIndex={f.sectionIndexes.length ? 0 : undefined}
                onMouseEnter={() => onHover(f.sectionIndexes)}
                onMouseLeave={() => onHover([])}
                onFocus={() => onHover(f.sectionIndexes)}
                onBlur={() => onHover([])}
              >
                <h3>
                  {f.sectionIndexes.length ? (
                    <button className="note-title" onClick={() => onJump(f.sectionIndexes)} title="Show in the chart">
                      {f.title}
                    </button>
                  ) : (
                    f.title
                  )}
                </h3>
                <p>{firstSentence(f.why)[0]}</p>
                {f.fixes.length > 0 && (
                  <div className="fixes">
                    {f.fixes.map((fix) => (
                      <button key={fix.label} onClick={() => onApply(fix.sections)}>
                        {fix.label}
                      </button>
                    ))}
                  </div>
                )}
                <details className="more">
                  <summary>More</summary>
                  {firstSentence(f.why)[1] && <p>{firstSentence(f.why)[1]}</p>}
                  <p className="provenance">
                    {BASIS[f.basis]}. Sources: {f.source}
                  </p>
                </details>
              </article>
            ));
        // Notes are context, not action: keep them folded so problems and warnings lead.
        return severity === "info" ? (
          <details key={severity} className={`note-group sev-${severity}`}>
            <summary>
              <h2>{heading}</h2>
            </summary>
            {items}
          </details>
        ) : (
          <section key={severity} className={`note-group sev-${severity}`}>
            <h2>{heading}</h2>
            {items}
          </section>
        );
      })}
    </>
  );
}
