import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { HexSky } from "@harmonics/lattice-ui";
import type { LatticeBoard } from "@harmonics/lattice-ui/board";
import { BLOCK_OF, type Pt, threadPath } from "../core/blocks.ts";
import {
  barPartsOf,
  barsOf,
  bottomOf,
  carryRoles,
  cutThrough,
  dropBar,
  finishPhrase,
  ghostsOf,
  type Layout,
  newPieceId,
  outlineOfSection,
  keysOf,
  partPolygon,
  pullBar,
  ROW,
  SHARED,
  sectionParts,
  songOf,
  splitBar,
  tidySection,
  TONE,
  withBars,
} from "../core/lattice.ts";
import { outlineOf, pieceOf } from "@harmonics/lattice-ui/hexes";
import { CODE, NAME } from "../core/parse.ts";
import type { Finding, Role, Section, Severity } from "../core/types.ts";
import { NoteCard } from "./Findings.tsx";
import { Mark, toPoints } from "./marks.tsx";

const COMMON: Role[] = ["intro", "verse", "prechorus", "chorus", "bridge", "outro"];
const MORE: Role[] = ["solo", "instrumental", "interlude", "transition", "coda"];
const RANK: Record<Severity, number> = { problem: 3, warning: 2, info: 1 };
/** The kit's lattice is drawn in pixels at scale 1: a block edge (a triangle's side) is 44 of them. */
const EDGE = 44;
/** Room round the board, in pixels: above for the first row's labels, right for breathing. */
const TOP = 30;
const PAD = 14;
/**
 * A gutter on the board's left, in block edges, outside where pieces go: the thread runs down it
 * when it wraps to a new row, so it is never cut off by the edge.
 */
const GUTTER = 0.85;

interface Props {
  sections: Section[];
  layout: Layout;
  findings: Finding[];
  highlight: number[];
  playBar: number;
  shears: boolean;
  onChange(sections: Section[], layout: Layout): void;
  /** The board's width, in the kit's pixels at scale 1, so layouts made elsewhere fit it. */
  onWidth(width: number): void;
  onPlayFrom(bar: number): void;
  onShearsDone(): void;
  /** Applies a finding's fix (a whole new song). */
  onApply(sections: Section[]): void;
  /** Changes whenever the first pinned note should open (the verdict's "to look at" link). */
  openFirst: number;
  /** The page's sky: the board puts its lattice where the board's cells are. */
  sky: React.RefObject<HexSky | null>;
  /** Starts an empty board from a classic form. */
  onStart(): void;
  /** Changes whenever the shelf of other notes should open (the verdict's notes link). */
  openShelf: number;
  /** Lays the whole song out afresh, in reading order. */
  onTidy(): void;
}

/** A note pinned to the board: the findings about one spot, a section's corner or a hand-off. */
interface Pin {
  key: string;
  at: Pt;
  severity: Severity;
  findings: Finding[];
  sections: number[];
}

/** Hexagon corners for a pin token. */
const PIN_HEX = [0, 1, 2, 3, 4, 5]
  .map((k) => {
    const a = (k * Math.PI) / 3;
    return `${(12 + 11 * Math.cos(a)).toFixed(2)},${(12 + 11 * Math.sin(a)).toFixed(2)}`;
  })
  .join(" ");

const inEdges = (p: Pt): Pt => ({ x: p.x / EDGE, y: p.y / EDGE });
const sidesPath = (sides: [Pt, Pt][]) =>
  sides.map(([a, b]) => `M${(a.x / EDGE).toFixed(3)},${(a.y / EDGE).toFixed(3)}L${(b.x / EDGE).toFixed(3)},${(b.y / EDGE).toFixed(3)}`).join("");

/**
 * The shape table: the song as pieces on the kit's `<lattice-board>`, which does the handling
 * (drag, the pull into a slot, turning, gluing, breaking, pulling a part off, throwing away). Over
 * it the app draws what the song needs: each section's label and place in the song, the thread
 * between sections, notes pinned where they apply, unfinished phrases, and the bar being played.
 */
export function LatticeTable(props: Props) {
  const { sections, layout, findings, highlight, playBar, shears } = props;
  const wrap = useRef<HTMLDivElement>(null);
  const boardRef = useRef<LatticeBoard>(null);
  const tray = useRef<HTMLDivElement>(null);
  const [px, setPx] = useState(800);
  const [showMore, setShowMore] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [shelfOpen, setShelfOpen] = useState(false);
  const shelfRef = useRef<HTMLDetailsElement>(null);
  const pinsRef = useRef<Pin[]>([]);
  // A bar being dragged in from the tray, and where the pointer is.
  const [adding, setAdding] = useState<{ role: Role; x: number; y: number } | null>(null);

  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setPx(entry!.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // Pixels per block edge: big enough to grab, small enough for a song to fit a laptop screen.
  const L = px < 520 ? 24 : 32;
  const scale = L / EDGE;
  const gutter = GUTTER * L;
  const boardW = Math.max(8 * L, px - gutter - PAD);
  // The board's width in the kit's pixels at scale 1: what layouts are made for.
  const width = boardW / scale;
  const widthRef = useRef(width);
  widthRef.current = width;
  const scaleRef = useRef(scale);
  scaleRef.current = scale;

  useEffect(() => {
    if (px > 100) props.onWidth(width);
  });

  // The board's pieces are the layout's; set only when the layout came from elsewhere, so the
  // board keeps its own focus and state through the changes it made itself.
  const fromBoard = useRef<unknown>(null);
  useLayoutEffect(() => {
    const board = boardRef.current;
    if (board && layout.pieces !== fromBoard.current) board.pieces = layout.pieces;
  }, [layout.pieces]);
  // Every change the board makes: read the song back from it; refuse one that leaves part of a bar.
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  useEffect(() => {
    const board = boardRef.current;
    if (!board) return;
    const changed = (e: CustomEvent<{ pieces: Layout["pieces"]; action: string; id: string }>) => {
      // A bar lifted by Alt-drag (see `lift` below) and let go where it was: it goes back into its
      // section, as if never lifted.
      const split = pulling.current;
      pulling.current = null;
      if (split && e.detail.id === split.barId) {
        const bar = e.detail.pieces.find((p) => p.id === split.barId);
        if (bar && keysOf(bar).join() === split.keys.join()) return putBack();
      }
      let next: Layout = { pieces: e.detail.pieces, roles: carryRoles(layoutRef.current, e.detail.pieces) };
      const read = songOf(next);
      if (!read.whole) {
        // Alt-drag pulls one part off a piece, and a part is one triangle: pull off the whole bar
        // it belongs to instead, moved as the triangle was. The board's change stands (refused,
        // it would slide the triangle back after a moment, over the bar), and its pieces are then
        // replaced by the bar's layout.
        const bar = e.detail.action === "pull" ? pullBar(layoutRef.current, e.detail.pieces, e.detail.id, widthRef.current, true) : null;
        if (!bar) return e.preventDefault();
        propsRef.current.onChange(songOf(bar).sections, bar);
        return;
      }
      // A bar lifted by Alt-drag has gone: what it left behind is laid out again where it stands,
      // in its proper shape.
      if (split && e.detail.id === split.barId) {
        const tidied = tidySection(next, split.sourceId, split.tone, widthRef.current);
        if (tidied !== next) {
          next = tidied;
          propsRef.current.onChange(songOf(next).sections, next);
          return;
        }
      }
      fromBoard.current = e.detail.pieces;
      propsRef.current.onChange(read.sections, next);
    };
    // Alt-drag: the board pulls off the one part under the pointer, and a part is one triangle.
    // Before it can, the bar that triangle belongs to is made a piece of its own, where it stands,
    // and the press passed on without Alt, so the board lifts and carries the whole bar.
    const lift = (e: PointerEvent) => {
      if (!e.altKey || e.button !== 0) return;
      const r = board.getBoundingClientRect();
      const at = { x: (e.clientX - r.left) / scaleRef.current, y: (e.clientY - r.top) / scaleRef.current };
      const split = splitBar(layoutRef.current, at, widthRef.current);
      if (!split) return;
      e.stopPropagation();
      e.preventDefault();
      pulling.current = { barId: split.barId, keys: split.keys, sourceId: split.sourceId, tone: split.tone };
      fromBoard.current = split.layout.pieces;
      board.pieces = split.layout.pieces;
      const target = board.shadowRoot?.elementsFromPoint(e.clientX, e.clientY).find((el) => el.closest(".piece"));
      target?.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          composed: true,
          cancelable: true,
          clientX: e.clientX,
          clientY: e.clientY,
          button: 0,
          buttons: 1,
          pointerId: e.pointerId,
          pointerType: e.pointerType,
          isPrimary: e.isPrimary,
        }),
      );
    };
    // Let go with no change at all (nowhere to go, or no move): the bar goes back too.
    const letGo = () =>
      setTimeout(() => {
        if (pulling.current) {
          pulling.current = null;
          putBack();
        }
      }, 450);
    board.addEventListener("change", changed);
    board.addEventListener("pointerdown", lift, { capture: true });
    window.addEventListener("pointerup", letGo);
    return () => {
      board.removeEventListener("change", changed);
      board.removeEventListener("pointerdown", lift, { capture: true });
      window.removeEventListener("pointerup", letGo);
    };
  }, []);
  /** A bar lifted by Alt-drag: its piece, and its triangles where it was lifted. */
  const pulling = useRef<{ barId: string; keys: string[]; sourceId: string; tone: number } | null>(null);
  /** The board back to the song's own pieces, after a bar was lifted and put back. */
  const putBack = () =>
    requestAnimationFrame(() => {
      const board = boardRef.current;
      if (!board) return;
      fromBoard.current = layoutRef.current.pieces;
      board.pieces = layoutRef.current.pieces;
    });
  const propsRef = useRef(props);
  propsRef.current = props;

  // The board has no lattice of its own: it moves the page's sky so the sky's cells are its cells.
  const placeSky = useRef(() => {});
  placeSky.current = () => {
    const sky = props.sky.current;
    const el = boardRef.current;
    if (!sky || !el) return;
    const s = sky.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    if (sky.orient !== "pointy") sky.orient = "pointy";
    if (Math.abs(sky.x - (r.left - s.left)) > 0.01) sky.x = r.left - s.left;
    if (Math.abs(sky.y - (r.top - s.top)) > 0.01) sky.y = r.top - s.top;
    if (Math.abs(sky.scale - scale) > 1e-4) sky.scale = scale;
  };
  useLayoutEffect(() => placeSky.current());
  useEffect(() => {
    const ro = new ResizeObserver(() => placeSky.current());
    ro.observe(document.documentElement);
    if (wrap.current) ro.observe(wrap.current);
    return () => ro.disconnect();
  }, []);
  // While a piece is in the hand the sky's lattice shows plainly, so you can see where it will go.
  const [aiming, setAiming] = useState(false);
  useEffect(() => {
    const sky = props.sky.current;
    sky?.classList.toggle("is-aiming", aiming || adding !== null);
    if (!aiming) return;
    const up = () => setAiming(false);
    window.addEventListener("pointerup", up);
    return () => window.removeEventListener("pointerup", up);
  }, [aiming, adding, props.sky]);

  // The verdict's links open the first (worst) pin, or the shelf of other notes.
  const firstSeen = useRef(props.openFirst);
  useEffect(() => {
    if (props.openFirst === firstSeen.current) return;
    firstSeen.current = props.openFirst;
    const first = pinsRef.current[0];
    if (first) {
      setOpen(first.key);
      const r = wrap.current?.getBoundingClientRect();
      if (r && (r.top < 0 || r.top > innerHeight * 0.6)) window.scrollBy({ top: r.top - 16, behavior: "smooth" });
    }
  }, [props.openFirst]);
  const shelfSeen = useRef(props.openShelf);
  useEffect(() => {
    if (props.openShelf === shelfSeen.current) return;
    shelfSeen.current = props.openShelf;
    setShelfOpen(true);
    shelfRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [props.openShelf]);
  // An open note closes on Escape or on a click anywhere outside it and its pin.
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !(e.target as Element).closest?.(".pin, .pin-note")) setOpen(null);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  const { order } = songOf(layout);
  const starts: number[] = [];
  sections.reduce((at, sec, i) => ((starts[i] = at), at + sec.bars), 0);
  const playing = playBar < 0 ? -1 : starts.findLastIndex((b) => b <= playBar);
  const bars = order.map(barsOf);
  // The bar being played: its own triangles (or cell) in its section's shape, lit as it sounds.
  const playingParts = playing < 0 ? null : (order[playing] ? barPartsOf(order[playing]!)[playBar - starts[playing]!] : null) ?? null;

  const flag = new Map<number, Severity>();
  for (const f of findings)
    for (const i of f.sectionIndexes)
      if (f.severity !== "info" && RANK[f.severity] > RANK[flag.get(i) ?? "info"]) flag.set(i, f.severity);
  const handoff = new Map<number, { severity: Severity; titles: string[] }>();
  for (const f of findings) {
    if (f.severity === "info") continue;
    for (const i of f.boundaries ?? []) {
      const was = handoff.get(i);
      handoff.set(i, {
        severity: was && RANK[was.severity] >= RANK[f.severity] ? was.severity : f.severity,
        titles: [...(was?.titles ?? []), f.title],
      });
    }
  }

  // Room under the last row for one more, and no more: the tray follows close below.
  const boardH = Math.max(bottomOf(layout) * scale + 2 * ROW * scale, 7 * L);
  const W = boardW / L;
  const Hh = boardH / L;

  /** A point on the board (block edges) in pixels from the table's top left. */
  const toPx = (p: Pt) => ({ left: gutter + p.x * L, top: TOP + p.y * L });
  const notePlace = (pin: Pin) => {
    const at = toPx(pin.at);
    const cardW = Math.min(340, px - 16);
    return { left: Math.max(8, Math.min(at.left - 24, px - cardW - 8)), top: at.top + 18, width: cardW };
  };
  /** A pointer's place on the board, in the kit's pixels at scale 1. */
  const onBoard = (e: { clientX: number; clientY: number }): Pt | null => {
    const r = boardRef.current?.getBoundingClientRect();
    if (!r || e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return null;
    return { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale };
  };

  const apply = (next: Layout | null) => {
    if (next) props.onChange(songOf(next).sections, next);
  };

  // A bar dragged in from the tray: follow the pointer, and drop it where it is let go.
  useEffect(() => {
    if (!adding) return;
    const move = (e: PointerEvent) => setAdding((a) => a && { ...a, x: e.clientX, y: e.clientY });
    const up = (e: PointerEvent) => {
      const at = onBoard(e);
      if (at) apply(dropBar(layoutRef.current, adding.role, at, width));
      setAdding(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    // Only the role matters here; the pointer is followed through state.
  }, [adding?.role, width]);

  function onSectionKey(e: React.KeyboardEvent, s: number) {
    const sec = sections[s]!;
    if (e.key === "+" || e.key === "=") {
      e.preventDefault();
      apply(withBars(layout, s, Math.min(64, sec.bars + 1), width));
    } else if (e.key === "-") {
      e.preventDefault();
      if (sec.bars > 1) apply(withBars(layout, s, sec.bars - 1, width));
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      apply(withBars(layout, s, 0, width));
    } else if (e.key === "Enter") {
      e.preventDefault();
      props.onPlayFrom(starts[s]!);
    }
  }

  /** Shears: every section the stroke goes clean through loses a bar. */
  function cut(points: Pt[]) {
    const stroke = points.map((p) => ({ x: (p.x - gutter) / scale, y: (p.y - TOP) / scale }));
    const hit = order.flatMap((sec, i) => (cutThrough(stroke, sec) ? [i] : []));
    let next: Layout | null = layout;
    // Last first, so removing a section doesn't move the ones still to cut.
    for (const i of hit.reverse()) next = next && withBars(next, i, Math.round(order[i]!.bars) - 1, width);
    if (hit.length) apply(next);
  }

  // The thread from each section into the next, in block edges.
  const threads = bars.slice(0, -1).map((b, s) => {
    const from = b.at(-1)?.map(inEdges);
    const to = bars[s + 1]?.[0]?.map(inEdges);
    if (!from || !to) return null;
    const top = order[s + 1]!.box.top / EDGE;
    const bottom = order[s]!.box.bottom / EDGE;
    return threadPath(from, to, top, top < bottom - 0.3);
  });

  // Findings pinned where they apply: on the hand-off they're about, or at the section's top
  // right corner. Notes, and findings about the song as a whole, go on the shelf below.
  const pinMap = new Map<string, Pin>();
  const shelf: Finding[] = [];
  const corner = (section: number): Pt | null => {
    const b = order[section]?.box;
    return b ? { x: b.right / EDGE, y: b.top / EDGE - 0.1 } : null;
  };
  for (const f of findings) {
    if (f.severity === "info") {
      shelf.push(f);
      continue;
    }
    const spots: Pt[] =
      f.rule === "R2"
        ? f.sectionIndexes.flatMap((i) => {
            const at = threads[i]?.mid ?? corner(i);
            return at ? [at] : [];
          })
        : [
            (f.boundaries ?? []).map((b) => threads[b]?.mid).find(Boolean) ??
              (f.sectionIndexes[0] !== undefined ? corner(f.sectionIndexes[0]) : null),
          ].filter((p): p is Pt => p !== null && p !== undefined);
    if (spots.length === 0) shelf.push(f);
    for (const at of spots) {
      const key = `${at.x.toFixed(1)},${at.y.toFixed(1)}`;
      const pin = pinMap.get(key);
      if (pin) {
        if (!pin.findings.includes(f)) pin.findings.push(f);
        pin.sections.push(...f.sectionIndexes);
        if (RANK[f.severity] > RANK[pin.severity]) pin.severity = f.severity;
      } else pinMap.set(key, { key, at, severity: f.severity, findings: [f], sections: [...f.sectionIndexes] });
    }
  }
  const pins = [...pinMap.values()].sort((a, b) => RANK[b.severity] - RANK[a.severity] || a.at.y - b.at.y || a.at.x - b.at.x);
  pinsRef.current = pins;
  const openPin = pins.find((p) => p.key === open);
  const pinned = openPin?.sections ?? [];

  /** A new section of `role` laid out under everything, for adding from the keyboard. */
  function addSection(role: Role) {
    const r = Math.ceil(bottomOf(layout) / ROW) + 1;
    const piece = pieceOf(newPieceId(), sectionParts(role, 4, { q: 0, r: layout.pieces.length ? r : 0 }));
    const roles = { ...layout.roles };
    if (TONE[role] === SHARED) roles[piece.id] = role;
    apply({ pieces: [...layout.pieces, piece], roles });
  }

  return (
    <div className="table-wrap">
      <div className="table" ref={wrap} style={{ height: boardH + TOP + PAD }}>
        <lattice-board
          ref={boardRef}
          className="board"
          scale={scale}
          label="The song's sections as pieces: Tab to a piece, arrows move it, R turns it, G glues it to what it touches, Shift+G breaks it apart, Delete throws it away"
          style={{ left: gutter, top: TOP, width: boardW, height: boardH }}
          onPointerDown={() => setAiming(true)}
          onPointerUp={(e) => {
            // The board focuses a piece only by Tab; a piece you click or drag takes the keyboard
            // too, so G, R, the arrows and Delete act on the piece you last touched.
            const { clientX: x, clientY: y } = e;
            requestAnimationFrame(() => {
              const hit = boardRef.current?.shadowRoot?.elementsFromPoint(x, y).find((el) => el.closest(".piece"));
              (hit?.closest(".piece") as SVGElement | null)?.focus({ preventScroll: true });
            });
          }}
        />
        <svg className="overlay" viewBox={`0 0 ${W} ${Hh}`} style={{ left: gutter, top: TOP, width: boardW, height: boardH }} aria-hidden={false}>
          <defs>
            {(["plain", "warning", "problem", "played"] as const).map((kind) => (
              <marker
                key={kind}
                id={`thread-arrow-${kind}`}
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="0.34"
                markerHeight="0.34"
                markerUnits="userSpaceOnUse"
                orient="auto-start-reverse"
              >
                <path d="M0,1 L9,5 L0,9 Z" className={`thread-arrow thread-arrow-${kind}`} />
              </marker>
            ))}
          </defs>
          {threads.map((t, s) => {
            if (!t) return null;
            const hit = handoff.get(s);
            const state = playing > s + 1 ? "is-played" : playing === s + 1 ? "is-now" : "";
            const kind = hit ? hit.severity : state ? "played" : "plain";
            return (
              <path key={`thread-${s}`} className={["thread", hit ? `flag-${hit.severity}` : "", state].join(" ")} d={t.d} markerEnd={`url(#thread-arrow-${kind})`}>
                <title>
                  {`${NAME[sections[s]!.role]} into ${NAME[sections[s + 1]!.role].toLowerCase()}`}
                  {hit ? `: ${hit.titles.join("; ")}` : ""}
                </title>
              </path>
            );
          })}
          {order.map((sec, s) => {
            const severity = flag.get(s);
            const song = sections[s];
            if (!song) return null;
            const ghosts = ghostsOf(layout, s, width);
            return (
              <g key={`${sec.pieceId}-${s}`} className="section-marks">
                {ghosts.map((part, k) => (
                  <polygon
                    key={`ghost-${k}`}
                    className={`ghost ${severity ? `flag-${severity}` : ""}`}
                    points={toPoints(partPolygon(part).map(inEdges))}
                    onClick={() => apply(finishPhrase(layout, s, width))}
                  >
                    <title>{`Finish the phrase: ${Math.ceil(song.bars / 4) * 4} bars`}</title>
                  </polygon>
                ))}
                <path
                  className={[
                    "section-outline",
                    severity ? `flag-${severity}` : "",
                    highlight.includes(s) || pinned.includes(s) ? "is-highlighted" : "",
                    s === playing ? "is-playing" : "",
                  ].join(" ")}
                  d={sidesPath(outlineOfSection(sec))}
                />
                <text
                  id={`section-${s}`}
                  className={`section-label ${severity ? `flag-${severity}` : ""}`}
                  x={sec.box.left / EDGE}
                  y={sec.box.top / EDGE - 0.22}
                  tabIndex={0}
                  role="button"
                  aria-label={`Section ${s + 1} of ${sections.length}: ${NAME[song.role]}, ${song.bars} bars. Plus and minus change its length, Delete removes it, Enter plays from it.`}
                  onKeyDown={(e) => onSectionKey(e, s)}
                >
                  <tspan className="order-number">{s + 1}</tspan>
                  <tspan dx="0.18">
                    {CODE[song.role]}
                    {song.bars}
                  </tspan>
                </text>
              </g>
            );
          })}
          {playingParts && (
            // Keyed by the bar, so each new bar is drawn afresh and pulses once.
            // Drawn as the piece itself, in its section's colour, lifted off the board: its side
            // below, a soft halo, and its top with a deeper edge.
            <g key={`bar-${playBar}`} className={`bar-lit block-${BLOCK_OF[order[playing]!.role].shape}`}>
              <g className="bar-lit-side">
                {playingParts.map((part, k) => (
                  <polygon key={k} points={toPoints(partPolygon(part).map(inEdges))} />
                ))}
              </g>
              <g className="bar-lit-top">
                <path className="bar-lit-halo" d={sidesPath(outlineOf(pieceOf("bar", playingParts)))} />
                {playingParts.map((part, k) => (
                  <polygon key={k} points={toPoints(partPolygon(part).map(inEdges))} />
                ))}
                <path className="bar-lit-edge" d={sidesPath(outlineOf(pieceOf("bar", playingParts)))} />
              </g>
            </g>
          )}
        </svg>
        {pins.length > 0 && (
          <div className="pins">
            {pins.map((pin) => {
              const at = toPx(pin.at);
              return (
                <button
                  key={pin.key}
                  className={`pin sev-${pin.severity} ${open === pin.key ? "is-open" : ""}`}
                  style={{ left: at.left - 12, top: at.top - 12 }}
                  aria-expanded={open === pin.key}
                  aria-label={`${pin.findings.length} ${pin.findings.length === 1 ? "note" : "notes"}: ${pin.findings.map((f) => f.title).join("; ")}`}
                  onClick={() => setOpen(open === pin.key ? null : pin.key)}
                >
                  <svg viewBox="0 0 24 24" aria-hidden>
                    <polygon className="pin-side" points={PIN_HEX} transform="translate(0 2)" />
                    <polygon className="pin-top" points={PIN_HEX} />
                    <text x="12" y="12.5" textAnchor="middle" dominantBaseline="central">
                      {pin.findings.length > 1 ? pin.findings.length : pin.severity === "problem" ? "!" : "?"}
                    </text>
                  </svg>
                </button>
              );
            })}
            {openPin && (
              <div className={`pin-note sev-${openPin.severity}`} role="dialog" aria-label={openPin.findings[0]!.title} style={notePlace(openPin)}>
                {openPin.findings.map((f, k) => (
                  <article key={`${f.rule}-${k}`} className="pin-finding">
                    <NoteCard
                      finding={f}
                      onApply={(next) => {
                        setOpen(null);
                        props.onApply(next);
                      }}
                    />
                  </article>
                ))}
                <button className="pin-close" onClick={() => setOpen(null)} aria-label="Close note">
                  ×
                </button>
              </div>
            )}
          </div>
        )}
        {layout.pieces.length === 0 && (
          <div className="table-empty">
            <div className="table-empty-inner">
              <p>Drag a shape from below onto the sky. Each shape is one bar.</p>
              <button className="table-start" onClick={props.onStart}>
                Start from a pop song
              </button>
            </div>
          </div>
        )}
        {shears && layout.pieces.length > 0 && (
          <shears-pad
            className="shears"
            onstrokeend={(e) => {
              // A stroke cut short (pointer cancelled, pad removed) cuts nothing.
              if (!e.detail.cancelled) cut(e.detail.points);
              props.onShearsDone();
            }}
          />
        )}
      </div>
      <div className="tray" ref={tray}>
        {[...COMMON, ...(showMore ? MORE : [])].map((role) => (
          <button
            key={role}
            className="tray-block"
            aria-label={`Add a bar of ${NAME[role].toLowerCase()}`}
            title={`${NAME[role]}: drag onto the sky. Each shape is one bar; drop it against a ${NAME[role].toLowerCase()} to add to it.`}
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              e.preventDefault();
              setAdding({ role, x: e.clientX, y: e.clientY });
            }}
            onClick={(e) => {
              // A keyboard press adds a 4-bar section of this type under the rest.
              if (e.detail === 0) addSection(role);
            }}
          >
            <Mark role={role} box={26} />
            <span>{NAME[role]}</span>
          </button>
        ))}
        <button className="add-more" onClick={() => setShowMore((v) => !v)} aria-expanded={showMore}>
          {showMore ? "Fewer" : "More…"}
        </button>
        {layout.pieces.length > 0 && (
          <button className="tidy" onClick={props.onTidy} title="Lay every section out again, neatly, in song order. Glued pieces come apart. Undo puts them back.">
            Tidy up
          </button>
        )}
      </div>
      {adding && (
        <div className="adding" style={{ left: adding.x, top: adding.y }} aria-hidden>
          <Mark role={adding.role} box={L * 1.8} />
        </div>
      )}
      {shelf.length > 0 && (
        <details className="shelf" ref={shelfRef} open={shelfOpen || shelf.some((f) => f.severity !== "info")} onToggle={(e) => setShelfOpen(e.currentTarget.open)}>
          <summary>
            Other notes <span className="count">({shelf.length})</span>
          </summary>
          <div className="shelf-notes">
            {shelf.map((f, k) => (
              <article key={`${f.rule}-${k}`} className={`shelf-note sev-${f.severity}`}>
                <NoteCard finding={f} onApply={props.onApply} />
              </article>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
