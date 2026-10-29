import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { HexSky } from "@harmonics/lattice-ui";
import type { LatticeBoard } from "@harmonics/lattice-ui/board";
import { BLOCK_OF, centroid, type Pt, threadPath } from "../core/blocks.ts";
import {
  barPartsOf,
  barsOf,
  bottomOf,
  carryRoles,
  connected,
  cutThrough,
  dropBar,
  finishPhrase,
  flow,
  ghostsOf,
  type Layout,
  layoutBarSources,
  newPieceId,
  outlineOfSection,
  keysOf,
  partPolygon,
  pullBar,
  pullOneBar,
  reachOf,
  ROW,
  SHARED,
  sectionIndexAt,
  sectionParts,
  songOf,
  splitBar,
  tidySection,
  TONE,
  withBars,
} from "../core/lattice.ts";
import { outlineOf, type Part, pieceOf } from "@harmonics/lattice-ui/hexes";
import { CODE, NAME } from "../core/parse.ts";
import type { Finding, Role, Section, Severity } from "../core/types.ts";
import { NoteCard } from "./Findings.tsx";
import { Mark, toPoints } from "./marks.tsx";
import { isWide } from "./wide.ts";

const COMMON: Role[] = ["intro", "verse", "prechorus", "chorus", "bridge", "outro"];
const MORE: Role[] = ["postchorus", "solo", "instrumental", "interlude", "transition", "coda"];
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
  /** The board's own refit of its pieces (a resize): a new layout for the same song, not an edit. */
  onRefit(layout: Layout): void;
}

/** A note pinned to the board: the findings about one spot, a section's corner or a hand-off. */
interface Pin {
  key: string;
  at: Pt;
  /** Where the pin is drawn, when `at` would put it over a section's label (see `clearOfLabels`). */
  place?: Pt;
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

/** The board's width in pixels, for a table `px` wide and blocks `L` pixels to an edge. */
const boardWidth = (px: number, L: number) => Math.max(8 * L, px - GUTTER * L - PAD);

/**
 * A phone's block size, from 28 to 44px an edge: one at which the song's widest section still fits
 * across the board, and among those from 34px up, the one that lays the song out in fewest rows
 * (the largest of those), so short sections pair up instead of each leaving most of its row empty.
 * A phone scrolls down easily and taps coarsely: no smaller than that to save a row.
 */
function fitEdge(sections: Section[], reach: number, px: number): number {
  // The room as measured, not `boardWidth`'s: its floor of 8 blocks would let a board outgrow the table.
  const fits = (L: number) => Math.max(8 * L, (reach * L) / EDGE) <= px - GUTTER * L - PAD;
  const rows = (L: number) => bottomOf(flow(sections, (boardWidth(px, L) * EDGE) / L));
  let best = 0;
  for (let L = 44; L >= 34; L -= 0.5) if (fits(L) && (!best || rows(L) < rows(best))) best = L;
  if (best) return best;
  for (let L = 33.5; L > 28; L -= 0.5) if (fits(L)) return L;
  return 28;
}

/** A short tap felt under the finger, where the phone has it (Android): a section picked or a bar dropped. */
const buzz = () => navigator.vibrate?.(8);
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
  // `from` is where it was pressed: let go near there, off the board, it was a tap.
  const [adding, setAdding] = useState<{ role: Role; x: number; y: number; from: { x: number; y: number } } | null>(null);
  // Picked up: moved off where it was pressed. Until then it may be a tap, or a swipe along the tray
  // (which the browser takes over, cancelling the press).
  const lifted = adding !== null && Math.hypot(adding.x - adding.from.x, adding.y - adding.from.y) >= 6;
  // The section picked to act on (by tap, click or its label): its piece and colour, so it stays
  // picked while the board moves, turns or glues that piece. The tray shows its actions. `at` is
  // where it was picked, in the board's pixels, to tell apart two sections of one type glued into
  // one piece.
  const [picked, setPicked] = useState<{ pieceId: string; tone: number; at: Pt } | null>(null);
  // The section under the mouse, or its ghost: an unflagged section shows its ghost only then.
  const [hovered, setHovered] = useState(-1);

  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setPx(entry!.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // Pixels per block edge: big enough to grab, small enough for a song to fit a laptop screen. On a
  // phone, as big as the widest section allows. Worked out again only when the width or the widest
  // section changes: a bar added elsewhere doesn't resize every block.
  const phone = px < 520;
  const reach = Math.max(EDGE, ...sections.map((s) => reachOf(s.role, s.bars)));
  const fit = useMemo(() => (phone ? fitEdge(sections, reach, px) : 32), [phone, px, reach, sections.length]);
  const L = fit;
  const scale = L / EDGE;
  const gutter = GUTTER * L;
  const boardW = boardWidth(px, L);
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
    // A copy: the board ignores an array it was handed before, even after the person has moved
    // its pieces since (so Undo, handing back an earlier layout's own array, would do nothing).
    if (board && layout.pieces !== fromBoard.current) {
      board.pieces = [...layout.pieces];
      // The board holds these now: an Undo back to what it held before is a change to push.
      fromBoard.current = layout.pieces;
    }
  }, [layout.pieces]);
  // Every change the board makes: read the song back from it; refuse one that leaves part of a bar.
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  useEffect(() => {
    const board = boardRef.current;
    if (!board) return;
    const changed = (e: CustomEvent<{ pieces: Layout["pieces"]; action: string; id: string }>) => {
      try {
      // A resize that moved pieces back onto a narrower board (no piece id): not the person's
      // edit. The app takes the board's pieces as its layout if they still read as the same song,
      // and lays the song out afresh if not, rather than reading a new order back as the song.
      if (e.detail.id === "") {
        const refit: Layout = { pieces: e.detail.pieces, roles: carryRoles(layoutRef.current, e.detail.pieces) };
        const song = propsRef.current.sections;
        const read = songOf(refit);
        const same = read.whole && read.sections.length === song.length && read.sections.every((x, i) => x.role === song[i]!.role && x.bars === song[i]!.bars);
        if (same) fromBoard.current = e.detail.pieces;
        propsRef.current.onRefit(same ? refit : flow(song, widthRef.current));
        return;
      }
      // A bar lifted by Alt-drag (see `lift` below) and let go where it was: it goes back into its
      // section, as if never lifted.
      const split = pulling.current;
      pulling.current = null;
      if (split && e.detail.id === split.barId) {
        const bar = e.detail.pieces.find((p) => p.id === split.barId);
        if (bar && keysOf(bar).join() === split.keys.join()) return putBack();
      }
      let next: Layout = { pieces: e.detail.pieces, roles: carryRoles(layoutRef.current, e.detail.pieces) };
      const provenance = split && layoutBarSources.get(split.layout);
      if (provenance) layoutBarSources.set(next, provenance);
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
          if (provenance) layoutBarSources.set(next, provenance);
          propsRef.current.onChange(songOf(next).sections, next);
          return;
        }
      }
      fromBoard.current = e.detail.pieces;
      propsRef.current.onChange(read.sections, next);
      } catch {
        // Ambiguous/mixed shared-color provenance must never rewrite musical content.
        e.preventDefault();
        pulling.current = null;
        putBack();
      }
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
      pulling.current = { barId: split.barId, keys: split.keys, sourceId: split.sourceId, tone: split.tone, layout: split.layout };
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
  const pulling = useRef<{ barId: string; keys: string[]; sourceId: string; tone: number; layout: Layout } | null>(null);
  /** The board back to the song's own pieces, after a bar was lifted and put back. */
  const putBack = () =>
    requestAnimationFrame(() => {
      const board = boardRef.current;
      if (!board) return;
      fromBoard.current = layoutRef.current.pieces;
      board.pieces = [...layoutRef.current.pieces];
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
    sky?.classList.toggle("is-aiming", aiming || lifted);
    if (!aiming) return;
    const up = () => setAiming(false);
    window.addEventListener("pointerup", up);
    return () => window.removeEventListener("pointerup", up);
  }, [aiming, lifted, props.sky]);

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
  // Escape lets go of the picked section.
  useEffect(() => {
    if (!picked) return;
    const key = (e: KeyboardEvent) => e.key === "Escape" && setPicked(null);
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [picked]);
  // Wider, an open note is a panel at the right, just under the stuck toolbar, wherever that is.
  const [noteTop, setNoteTop] = useState(96);
  useLayoutEffect(() => {
    if (open) setNoteTop(Math.max(0, document.querySelector(".toolbar")?.getBoundingClientRect().bottom ?? 84) + 12);
  }, [open]);
  // An open note is a sheet over the bottom of a phone's screen: its pin, and the section it is
  // about, scroll up into the room above it.
  useEffect(() => {
    if (!open || isWide()) return;
    const pin = wrap.current?.querySelector<HTMLElement>(".pin.is-open");
    const top = pin?.getBoundingClientRect().top;
    if (top === undefined || (top > innerHeight * 0.15 && top < innerHeight * 0.4)) return;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollBy({ top: top - innerHeight * 0.25, behavior: reduce ? "auto" : "smooth" });
  }, [open]);
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
  /**
   * The finger-sized target round a section's label, in block edges. It ends above the section's
   * top, clear of its pieces (the board draws them lifted a little), so a press on a piece always
   * reaches the piece.
   */
  const labelH = 44 / L;
  const labelOrigin = (sec: { box: { left: number; top: number } }) => ({ x: sec.box.left / EDGE - 0.15, y: sec.box.top / EDGE - 0.3 - labelH });
  const origins = order.map(labelOrigin);
  // Each label's target, stopping where the next label's starts on its line, so packed 1-bar
  // sections each keep their own.
  const labelHits = origins.map(({ x, y }) => {
    const next = origins.filter((o) => o.x > x + 1e-6 && Math.abs(o.y - y) < labelH).reduce((m, o) => Math.min(m, o.x), Infinity);
    return { x, y, width: Math.min(Math.max(labelH, 2.6), next - x), height: labelH };
  });
  /**
   * A pin over a section's label would take the clicks meant for it (packed 1-bar sections put
   * one section's corner on the next one's label): such a pin is drawn just below the label
   * instead, on its pieces' top edge (the label's text reaches a little below its target), and
   * beside a pin already there. Until nothing moves: a move can land on another label.
   */
  const clearOfLabels = (pins: Pin[]) => {
    const r = 12 / L; // half a pin, in block edges
    for (let pass = 0; pass < 4; pass++) {
      let moved = false;
      pins.forEach((pin, k) => {
        order.forEach((sec, i) => {
          const hit = labelHits[i]!;
          const bottom = sec.box.top / EDGE - 0.08;
          const p = pin.place ?? pin.at;
          if (p.x + r > hit.x && p.x - r < hit.x + hit.width && p.y + r > hit.y && p.y - r < bottom) {
            let place = { x: p.x, y: bottom + r + 0.02 };
            while (pins.slice(0, k).some((o) => Math.hypot((o.place ?? o.at).x - place.x, (o.place ?? o.at).y - place.y) < 2 * r))
              place = { x: place.x + 2 * r, y: place.y };
            pin.place = place;
            moved = true;
          }
        });
      });
      if (!moved) break;
    }
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
      if (at) {
        const next = dropBar(layoutRef.current, adding.role, at, width);
        apply(next);
        if (next) buzz();
      }
      else if (Math.hypot(e.clientX - adding.from.x, e.clientY - adding.from.y) < 6) addSection(adding.role);
      setAdding(null);
    };
    const cancel = () => setAdding(null);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
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
    } else if (e.key === " ") {
      e.preventDefault();
      const sec = order[s];
      if (sec) setPicked({ pieceId: sec.pieceId, tone: sec.parts[0]!.tone, at: centroid(partPolygon(sec.parts[0]!)) });
    }
  }

  /** Shears: every section the stroke goes clean through loses a bar. Points are the pad's. */
  function cut(points: Pt[], pad: Element) {
    const from = pad.getBoundingClientRect();
    const board = boardRef.current?.getBoundingClientRect();
    if (!board) return;
    const stroke = points.map((p) => ({ x: (p.x + from.left - board.left) / scale, y: (p.y + from.top - board.top) / scale }));
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
    const sameRow = top < bottom - 0.3;
    const path = threadPath(from, to, top, sameRow);
    // threadPath can wrap on the same row too (when the next section starts to the left); it returns ends only then.
    return { ...path, wraps: path.ends !== undefined };
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
  clearOfLabels(pins);
  pinsRef.current = pins;
  const openPin = pins.find((p) => p.key === open);
  // Of the sections in the picked piece and colour, the one nearest where it was picked.
  const pickedIndex = picked
    ? order.reduce((best, s, i) => {
        if (s.pieceId !== picked.pieceId || s.parts[0]!.tone !== picked.tone) return best;
        const d = (k: number) => Math.hypot((order[k]!.box.left + order[k]!.box.right) / 2 - picked.at.x, (order[k]!.box.top + order[k]!.box.bottom) / 2 - picked.at.y);
        return best < 0 || d(i) < d(best) ? i : best;
      }, -1)
    : -1;
  // From the layout, not the song: the song can lag the layout by a render (after a drop or a cut).
  const pickedSec = pickedIndex >= 0 ? order[pickedIndex] : undefined;
  const pickedBars = pickedSec ? Math.round(pickedSec.bars) : 0;
  const pinned = [...(openPin?.sections ?? []), ...(pickedIndex >= 0 ? [pickedIndex] : [])];

  /**
   * One of the board's own keys (R turn, G glue, Shift+G break apart) sent to the picked
   * section's piece, as if it had the keyboard: the same actions for a finger as for keys.
   */
  const boardKey = (key: string, shiftKey = false) => {
    const sec = order[pickedIndex];
    const board = boardRef.current;
    if (!sec || !board) return;
    const r = board.getBoundingClientRect();
    const mid = centroid(partPolygon(sec.parts[0]!));
    const el = board.shadowRoot
      ?.elementsFromPoint(r.left + mid.x * scale, r.top + mid.y * scale)
      .find((x) => x.closest(".piece"))
      ?.closest(".piece");
    el?.dispatchEvent(new KeyboardEvent("keydown", { key, shiftKey, bubbles: true, composed: true, cancelable: true }));
  };

  /** Nothing picked, and the piece the tap focused lets go of the keyboard and its ring. */
  const letGoOfPick = () => {
    setPicked(null);
    (boardRef.current?.shadowRoot?.activeElement as HTMLElement | SVGElement | null)?.blur();
  };

  /**
   * A new section of `role` laid out under everything, for adding from the keyboard or a tap. It is
   * picked, so the tray shows what was added and its actions, and scrolled into view.
   */
  function addSection(role: Role) {
    const now = layoutRef.current;
    const r = Math.ceil(bottomOf(now) / ROW) + 1;
    const piece = pieceOf(newPieceId(), sectionParts(role, 4, { q: 0, r: now.pieces.length ? r : 0 }));
    const roles = { ...now.roles };
    if (TONE[role] === SHARED) roles[piece.id] = role;
    apply({ pieces: [...now.pieces, piece], roles });
    setPicked({ pieceId: piece.id, tone: piece.parts[0]!.tone, at: centroid(partPolygon(piece.parts[0]!)) });
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    requestAnimationFrame(() =>
      document.getElementById(`section-${songOf(layoutRef.current).order.length - 1}`)?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" }),
    );
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
          onPointerMove={(e) => {
            if (e.pointerType !== "mouse") return;
            const r = boardRef.current?.getBoundingClientRect();
            if (!r) return;
            const at = { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale };
            setHovered(sectionIndexAt(layout, at));
          }}
          onPointerLeave={() => setHovered(-1)}
          onPointerUp={(e) => {
            // The board focuses a piece only by Tab; a piece you click or drag takes the keyboard
            // too, so G, R, the arrows and Delete act on the piece you last touched.
            // A finger has no keyboard to give it, and the focus ring is a box round the piece, not
            // its shape: a touch picks the section instead, drawn round its own outline.
            const { clientX: x, clientY: y } = e;
            if (e.pointerType === "mouse" || e.pointerType === "pen")
              requestAnimationFrame(() => {
                const hit = boardRef.current?.shadowRoot?.elementsFromPoint(x, y).find((el) => el.closest(".piece"));
                (hit?.closest(".piece") as SVGElement | null)?.focus({ preventScroll: true });
              });
            // The piece under the finger is picked (once the board has settled it), or nothing,
            // tapping empty sky. A mouse on a wide screen has the keyboard for that, and keeps the
            // tray of shapes; under the stylesheet's phone width the tray is the way to the actions.
            const touch = e.pointerType !== "mouse" || !isWide();
            setTimeout(() => {
              const r = boardRef.current?.getBoundingClientRect();
              if (!r) return;
              const at = { x: (x - r.left) / scaleRef.current, y: (y - r.top) / scaleRef.current };
              const s = songOf(layoutRef.current).order[sectionIndexAt(layoutRef.current, at)];
              if (s && touch) {
                setPicked({ pieceId: s.pieceId, tone: s.parts[0]!.tone, at });
                buzz();
              }
              else if (!s) setPicked(null);
            }, 80);
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
            // On a phone nearly every hand-off wraps to a new row: instead of loops back across the
            // board, a spine down the left gutter, out of each section's left side and into the
            // next's, so the song reads top to bottom. A wrap with a note keeps its whole path; one
            // out of a section further along its row (it would cross its neighbour) breaks as on a
            // wide screen.
            const a = order[s]!.box;
            const b = order[s + 1]!.box;
            if (phone && t.wraps && !hit && a.left / EDGE < 1) {
              const ay = (a.top + a.bottom) / 2 / EDGE;
              const by = (b.top + b.bottom) / 2 / EDGE;
              // Far enough out that a section at the board's very left edge still gets a visible run in.
              const x = -GUTTER + 0.1;
              const r = 0.2;
              const d = `M${a.left / EDGE - 0.1},${ay} L${x + r},${ay} Q${x},${ay} ${x},${ay + r} L${x},${by - r} Q${x},${by} ${x + r},${by} L${b.left / EDGE - 0.12},${by}`;
              return (
                <path key={`thread-${s}`} className={["thread", state].join(" ")} d={d} markerEnd={`url(#thread-arrow-${kind})`}>
                  <title>{`${NAME[sections[s]!.role]} into ${NAME[sections[s + 1]!.role].toLowerCase()}`}</title>
                </path>
              );
            }
            // A flagged hand-off opens its note when tapped: hover tooltips don't reach a finger.
            const pin = hit && pins.find((p) => Math.hypot(p.at.x - t.mid.x, p.at.y - t.mid.y) < 0.05);
            const label = `${NAME[sections[s]!.role]} into ${NAME[sections[s + 1]!.role].toLowerCase()}`;
            // A plain wrap is a line break: its two ends, each with a dot where it breaks off, and
            // no run back across the board. A wrap with a note keeps the whole path for its pin.
            if (t.wraps && !hit && t.ends) {
              const cls = ["thread", state].join(" ");
              return (
                <g key={`thread-${s}`} className="thread-break">
                  <title>{label}</title>
                  <path className={cls} d={t.ends.out} />
                  <circle className={`thread-dot ${state}`} cx={t.ends.outEnd.x} cy={t.ends.outEnd.y} r={0.1} />
                  <circle className={`thread-dot ${state}`} cx={t.ends.inStart.x} cy={t.ends.inStart.y} r={0.1} />
                  <path className={cls} d={t.ends.in} markerEnd={`url(#thread-arrow-${kind})`} />
                </g>
              );
            }
            return (
              <g key={`thread-${s}`}>
                <path className={["thread", hit ? `flag-${hit.severity}` : "", state].join(" ")} d={t.d} markerEnd={`url(#thread-arrow-${kind})`}>
                  <title>
                    {`${NAME[sections[s]!.role]} into ${NAME[sections[s + 1]!.role].toLowerCase()}`}
                    {hit ? `: ${hit.titles.join("; ")}` : ""}
                  </title>
                </path>
                {pin && <path className="thread-hit" d={t.d} onClick={() => setOpen(pin.key)} />}
              </g>
            );
          })}
          {order.map((sec, s) => {
            const severity = flag.get(s);
            const song = sections[s];
            if (!song) return null;
            // A flagged section always shows where its phrase would finish; any other only while
            // it is in hand (hovered, picked, or its note open), so a short intro the verdict is
            // happy with doesn't wear a shape bigger than itself.
            const shown = !aiming && (severity !== undefined || hovered === s || pinned.includes(s));
            const ghosts = shown ? ghostsOf(layout, s, width) : [];
            const finished = Math.ceil(song.bars / 4) * 4;
            // The "+N" sits in the biggest stretch of the ghost, so a ghost split either side of
            // its section doesn't put it over the section.
            const biggest = connected(ghosts).reduce<Part[]>((a, b) => (b.length > a.length ? b : a), []);
            const mid = biggest.length ? centroid(biggest.flatMap((part) => partPolygon(part).map(inEdges))) : null;
            return (
              <g key={`${sec.pieceId}-${s}`} className="section-marks">
                {ghosts.length > 0 && (
                  <g
                    className={`ghost-group ${severity ? `flag-${severity}` : ""}`}
                    onClick={() => apply(finishPhrase(layout, s, width))}
                    onPointerEnter={() => setHovered(s)}
                    onPointerLeave={() => setHovered(-1)}
                  >
                    <title>{`Finish the phrase: ${song.bars} bars to ${finished}`}</title>
                    {ghosts.map((part, k) => (
                      <polygon key={`ghost-${k}`} className="ghost" points={toPoints(partPolygon(part).map(inEdges))} />
                    ))}
                    {/* One dashed edge round each stretch, not one round every triangle. */}
                    {connected(ghosts).map((group, k) => (
                      <path key={`ghost-edge-${k}`} className="ghost-edge" d={sidesPath(outlineOf(pieceOf("ghost", group)))} />
                    ))}
                    {mid && (
                      <text className="ghost-label" x={mid.x} y={mid.y} textAnchor="middle" dominantBaseline="central">
                        {`+${finished - song.bars}`}
                      </text>
                    )}
                  </g>
                )}
                <path
                  className={[
                    "section-outline",
                    // A rarer section's pieces are white on the board: its edge carries its colour,
                    // as its hollow shape in the tray does.
                    BLOCK_OF[song.role].hollow ? `is-hollow block-${BLOCK_OF[song.role].shape}` : "",
                    severity ? `flag-${severity}` : "",
                    highlight.includes(s) || pinned.includes(s) ? "is-highlighted" : "",
                    s === playing ? "is-playing" : "",
                  ].join(" ")}
                  d={sidesPath(outlineOfSection(sec))}
                />
                {/* A finger-sized target round the label: tap it, or Tab to it, to pick the section. */}
                <rect
                  id={`section-${s}`}
                  className="label-hit"
                  {...labelHits[s]}
                  tabIndex={0}
                  role="button"
                  aria-label={`Section ${s + 1} of ${sections.length}: ${NAME[song.role]}, ${song.bars} bars. Space shows its actions, plus and minus change its length, Delete removes it, Enter plays from it.`}
                  onClick={() => setPicked({ pieceId: sec.pieceId, tone: sec.parts[0]!.tone, at: centroid(partPolygon(sec.parts[0]!)) })}
                  onKeyDown={(e) => onSectionKey(e, s)}
                />
                <text
                  className={`section-label ${severity ? `flag-${severity}` : ""}`}
                  x={sec.box.left / EDGE}
                  y={sec.box.top / EDGE - 0.22}
                  aria-hidden
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
              const at = toPx(pin.place ?? pin.at);
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
              <div className={`pin-note sev-${openPin.severity}`} role="dialog" aria-label={openPin.findings[0]!.title} style={{ "--note-top": `${noteTop}px` } as React.CSSProperties}>
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
              if (!e.detail.cancelled && e.currentTarget instanceof Element) cut(e.detail.points, e.currentTarget);
              props.onShearsDone();
            }}
          />
        )}
      </div>
      <div className={`tray ${pickedSec ? "is-actions" : ""}`} ref={tray}>
        {pickedSec ? (
          // The picked section's actions, where the thumb is: the board's keys (R, G, Shift+G)
          // and the label's (+, −, Delete, Enter) for a finger.
          <SectionActions
            key={pickedIndex}
            name={`${NAME[pickedSec.role]}, ${pickedBars} ${pickedBars === 1 ? "bar" : "bars"}`}
            bars={pickedBars}
            onTurn={() => boardKey("r")}
            onGlue={() => boardKey("g")}
            onBreak={() => boardKey("G", true)}
            onPull={() => apply(pullOneBar(layout, pickedIndex, width))}
            onShorter={() => apply(withBars(layout, pickedIndex, pickedBars - 1, width))}
            onLonger={() => apply(withBars(layout, pickedIndex, Math.min(64, pickedBars + 1), width))}
            onPlay={() => starts[pickedIndex] !== undefined && props.onPlayFrom(starts[pickedIndex]!)}
            onRemove={() => {
              apply(withBars(layout, pickedIndex, 0, width));
              letGoOfPick();
            }}
            onClose={letGoOfPick}
          />
        ) : (
        <>
        {[...COMMON, ...(showMore ? MORE : [])].map((role, k) => (
          <Fragment key={role}>
          {/* The rarer, hollow shapes start a row of their own. */}
          {k === COMMON.length && <span className="tray-break" aria-hidden />}
          <button
            className="tray-block"
            aria-label={`Add a bar of ${NAME[role].toLowerCase()}`}
            title={`${NAME[role]}: tap to add a section, or drag onto the sky. Each shape is one bar; drop it against a ${NAME[role].toLowerCase()} to add to it.`}
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              e.preventDefault();
              setAdding({ role, x: e.clientX, y: e.clientY, from: { x: e.clientX, y: e.clientY } });
            }}
            onClick={(e) => {
              // A keyboard press adds a 4-bar section of this type under the rest.
              if (e.detail === 0) addSection(role);
            }}
          >
            <Mark role={role} box={26} />
            <span>{NAME[role]}</span>
          </button>
          </Fragment>
        ))}
        <button className="add-more" onClick={() => setShowMore((v) => !v)} aria-expanded={showMore}>
          {showMore ? "Fewer" : "More…"}
        </button>
        {layout.pieces.length > 0 && (
          <button className="tidy" onClick={props.onTidy} title="Lay every section out again, neatly, in song order. Glued pieces come apart. Undo puts them back.">
            Tidy up
          </button>
        )}
        </>
        )}
      </div>
      {adding && lifted && (
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

/** The picked section's actions, in the tray: what the keyboard does, for a finger. */
function SectionActions(props: {
  name: string;
  bars: number;
  onTurn(): void;
  onGlue(): void;
  onBreak(): void;
  onPull(): void;
  onShorter(): void;
  onLonger(): void;
  onPlay(): void;
  onRemove(): void;
  onClose(): void;
}) {
  // On a phone the actions are two rows: the name, ⋯ and Done, then the ones used most, Remove set
  // apart at the far end. ⋯ shows the rest instead, each with what it does, under a header whose
  // arrow comes back. A wide tray shows them all in one row.
  const [more, setMore] = useState(false);
  const el = useRef<HTMLDivElement>(null);
  // The button pressed is hidden by the swap: the keyboard goes to the first of the other view.
  const swap = (to: boolean) => {
    setMore(to);
    requestAnimationFrame(() => el.current?.querySelector<HTMLButtonElement>(to ? ".section-actions-rest button" : ".section-actions-more")?.focus());
  };
  // Swiped down, as a sheet is, it lets go of the section.
  const closeRef = useRef(props.onClose);
  closeRef.current = props.onClose;
  useEffect(() => {
    const root = el.current;
    if (!root) return;
    let from: number | null = null;
    const down = (e: PointerEvent) => {
      from = e.pointerType === "mouse" ? null : e.clientY;
    };
    const up = (e: PointerEvent) => {
      if (from !== null && e.clientY - from > 40) closeRef.current();
      from = null;
    };
    root.addEventListener("pointerdown", down);
    window.addEventListener("pointerup", up);
    return () => {
      root.removeEventListener("pointerdown", down);
      window.removeEventListener("pointerup", up);
    };
  }, []);
  return (
    <div className={`section-actions ${more ? "is-more" : ""}`} ref={el} role="toolbar" aria-label={`${props.name}: actions`}>
      <span className="section-actions-handle" aria-hidden />
      {more ? (
        <button className="section-actions-back" onClick={() => swap(false)} aria-label={`Back to ${props.name}`}>
          <span aria-hidden>←</span> {props.name}
        </button>
      ) : (
        <span className="section-actions-name">{props.name}</span>
      )}
      <button className="section-actions-more" onClick={() => swap(true)} aria-label="More actions" aria-expanded={more}>
        ⋯
      </button>
      <button onClick={props.onClose} className="section-actions-close" title="Done (Esc)">
        Done
      </button>
      <span className="section-actions-main">
        <button onClick={props.onShorter} disabled={props.bars < 2} aria-label="One bar shorter" title="One bar shorter (−)">
          −
        </button>
        <button onClick={props.onLonger} aria-label="One bar longer" title="One bar longer (+)">
          +
        </button>
        <button onClick={props.onTurn} title="Turn (R)">
          Turn
        </button>
        <button onClick={props.onPlay} title="Play from here (Enter)">
          Play
        </button>
        <button onClick={props.onRemove} className="danger" title="Remove the section (Delete)">
          Remove
        </button>
      </span>
      <span className="section-actions-rest">
        <button onClick={props.onGlue} aria-label="Glue to neighbours" title="Glue to what it touches (G)">
          <span className="action-name">Glue to neighbours</span>
          <span className="action-note">The sections it touches move with it.</span>
        </button>
        <button onClick={props.onBreak} aria-label="Break apart" title="Break apart (Shift+G)">
          <span className="action-name">Break apart</span>
          <span className="action-note">Glued sections move on their own again.</span>
        </button>
        <button onClick={props.onPull} disabled={props.bars < 2} aria-label="Pull a bar off" title="Take one bar off, beside it (or Alt-drag a bar)">
          <span className="action-name">Pull a bar off</span>
          <span className="action-note">One bar becomes a section of its own beside it.</span>
        </button>
      </span>
    </div>
  );
}
