import { useRef, useState } from "react";
import type { ShearsPadElement, StrokePoint } from "@harmonics/lattice-ui";
import { insertAt, move, pruneAt } from "../core/fixes.ts";
import { CODE, DEFAULT_BARS, NAME } from "../core/parse.ts";
import type { Finding, Role, Section, Severity } from "../core/types.ts";
import { Mark } from "./marks.tsx";

const COMMON: Role[] = ["intro", "verse", "prechorus", "chorus", "bridge", "outro"];
const MORE: Role[] = ["solo", "instrumental", "interlude", "transition", "coda"];
const RANK: Record<Severity, number> = { problem: 3, warning: 2, info: 1 };
const PER_LINE = 4;

interface Props {
  sections: Section[];
  highlight: number[];
  findings: Finding[];
  playBar: number;
  onChange(next: Section[]): void;
  onPlayFrom(bar: number): void;
  /** Shears mode: a stroke across the chart prunes the section it crosses. */
  shears: boolean;
  onShearsDone(): void;
}

/**
 * Where a shears stroke cuts: the first section it crosses. Across a section's
 * mark it removes the section; across its bars it cuts at the barline nearest
 * the stroke's middle there.
 */
function cutFor(points: StrokePoint[], pad: Element): { index: number; bars: number } | null {
  const box = pad.getBoundingClientRect();
  const hits = points.flatMap((p) => {
    const el = document
      .elementsFromPoint(box.left + p.x, box.top + p.y)
      .find((e) => e instanceof HTMLElement && e.dataset.section !== undefined) as HTMLElement | undefined;
    return el ? [{ el, x: box.left + p.x }] : [];
  });
  const first = hits[0];
  if (!first) return null;
  const index = Number(first.el.dataset.section);
  const here = hits.filter((h) => h.el.dataset.section === String(index));
  if (here.some((h) => h.el.dataset.mark !== undefined)) return { index, bars: 0 };
  const mid = here[Math.floor(here.length / 2)]!;
  const bar = Number(mid.el.dataset.bar);
  const rect = mid.el.getBoundingClientRect();
  return { index, bars: mid.x < rect.left + rect.width / 2 ? bar : bar + 1 };
}

/** The form drawn as a lead sheet: 4 bars per line, so an irregular section leaves a ragged edge. */
export function Chart({ sections, highlight, findings, playBar, onChange, onPlayFrom, shears, onShearsDone }: Props) {
  const pad = useRef<ShearsPadElement>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [showMore, setShowMore] = useState(false);

  const worst = new Map<number, Severity>();
  for (const f of findings)
    for (const i of f.sectionIndexes)
      if (RANK[f.severity] > RANK[worst.get(i) ?? "info"] || !worst.has(i)) worst.set(i, f.severity);

  const setAt = (i: number, patch: Partial<Section>) =>
    onChange(sections.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  let cursor = 0;

  return (
    <div className="chart">
      {sections.length === 0 && (
        <p className="chart-empty">No sections yet. Add one below, or use Text to type a whole form at once.</p>
      )}
      <div className="sections">
      {sections.map((s, i) => {
        const first = cursor;
        cursor += s.bars;
        const lines: number[][] = [];
        for (let b = 0; b < s.bars; b += PER_LINE)
          lines.push(Array.from({ length: Math.min(PER_LINE, s.bars - b) }, (_, k) => b + k));
        const flag = worst.get(i);
        const isLast = i === sections.length - 1;
        const classes = [
          "section",
          s.role === "chorus" ? "is-hook" : "",
          flag ? `flag-${flag}` : "",
          highlight.includes(i) ? "is-highlighted" : "",
          dragFrom === i ? "is-dragging" : "",
        ].join(" ");

        return (
          <div
            key={i}
            id={`section-${i}`}
            className={classes}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (dragFrom !== null && dragFrom !== i) onChange(move(sections, dragFrom, dragFrom < i ? i + 1 : i));
              setDragFrom(null);
            }}
          >
            <div className="mark">
              <span
                className="mark-handle"
                draggable
                data-section={i}
                data-mark=""
                onDragStart={() => setDragFrom(i)}
                onDragEnd={() => setDragFrom(null)}
                title={`${CODE[s.role]}${s.bars}. Drag to move this section`}
              >
                <Mark role={s.role} box={36} />
              </span>
              <span className="mark-text">
                <span className="mark-name">{NAME[s.role]}</span>
                <span className="mark-bars">
                  {s.bars} {s.bars === 1 ? "bar" : "bars"}
                  {s.intentional ? ", on purpose" : ""}
                </span>
              </span>
              <span className="tools">
                <button onClick={() => setAt(i, { bars: Math.max(1, s.bars - 1) })} aria-label={`Remove a bar from ${NAME[s.role]}`} title="Remove a bar">
                  −
                </button>
                <button onClick={() => setAt(i, { bars: Math.min(64, s.bars + 1) })} aria-label={`Add a bar to ${NAME[s.role]}`} title="Add a bar">
                  +
                </button>
                <button onClick={() => onChange(insertAt(sections, i + 1, { ...s }))} title="Duplicate" aria-label={`Duplicate ${NAME[s.role]}`}>
                  ⧉
                </button>
                <button onClick={() => onChange(pruneAt(sections, i, 0))} title="Prune this section" aria-label={`Prune ${NAME[s.role]}`}>
                  <lattice-icon name="shears" />
                </button>
              </span>
            </div>
            <div className="systems">
              {lines.map((line, li) => {
                const lastLine = li === lines.length - 1;
                return (
                  <div key={li} className="system">
                    {line.map((b) => {
                      const abs = first + b;
                      const end = lastLine && b === s.bars - 1;
                      return (
                        <button
                          key={b}
                          className={["bar", end ? (isLast ? "end-final" : "end-section") : "", abs === playBar ? "is-playing" : ""].join(" ")}
                          data-section={i}
                          data-bar={b}
                          onClick={() => onPlayFrom(abs)}
                          aria-label={`Play from bar ${abs + 1}, ${NAME[s.role]} bar ${b + 1}`}
                        >
                          {b % PER_LINE === 0 && <span className="bar-number">{abs + 1}</span>}
                        </button>
                      );
                    })}
                    {lastLine &&
                      Array.from({ length: PER_LINE - line.length }, (_, g) => {
                        const bars = s.bars + g + 1;
                        return (
                          <button
                            key={`g${g}`}
                            className="ghost"
                            onClick={() => setAt(i, { bars, intentional: false })}
                            aria-label={`Extend ${NAME[s.role]} to ${bars} bars`}
                            title={`Extend to ${bars} bars`}
                          />
                        );
                      })}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
        {shears && sections.length > 0 && (
          <shears-pad
            ref={pad}
            className="shears"
            onstrokeend={(e) => {
              // A stroke cut short (pointer cancelled, pad removed) cuts nothing.
              const cut = !e.detail.cancelled && pad.current && cutFor(e.detail.points, pad.current);
              if (cut) onChange(pruneAt(sections, cut.index, cut.bars));
              onShearsDone();
            }}
          />
        )}
      </div>
      <div className="add">
        {[...COMMON, ...(showMore ? MORE : [])].map((role) => (
          <button
            key={role}
            className="add-button"
            onClick={() => onChange([...sections, { role, bars: DEFAULT_BARS[role], intentional: false }])}
          >
            <Mark role={role} box={20} />
            {NAME[role]}
          </button>
        ))}
        <button className="add-more" onClick={() => setShowMore((v) => !v)} aria-expanded={showMore}>
          {showMore ? "Fewer" : "More…"}
        </button>
      </div>
    </div>
  );
}
