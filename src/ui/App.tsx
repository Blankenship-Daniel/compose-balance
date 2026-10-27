import { useEffect, useMemo, useRef, useState } from "react";
import type { HexSky } from "@harmonics/lattice-ui";
import { Player } from "../audio/player.ts";
import { format, parse } from "../core/parse.ts";
import { PRESETS } from "../core/presets.ts";
import { COMMON_METERS, formatMeter, FOUR_FOUR, parseMeter, tempoNote } from "../core/meter.ts";
import { analyze } from "../core/score.ts";
import { DEFAULT_ERA, ERA_NAME } from "../core/corpus.ts";
import { formatSeconds, secondsFor } from "../core/stats.ts";
import type { Era, Options, Section } from "../core/types.ts";
import { Chart } from "./Chart.tsx";
import { LatticeTable } from "./LatticeTable.tsx";
import { flow, type Layout, rightOf, sync } from "../core/lattice.ts";
import { Verdict } from "./Verdict.tsx";
import { Exchange } from "./Exchange.tsx";
import { Findings } from "./Findings.tsx";
import { Help } from "./Help.tsx";
import { Menu } from "./Menu.tsx";

function readHash(): { notation: string; bpm: number; meter: string; era: Era } | null {
  const params = new URLSearchParams(location.hash.slice(1));
  const f = params.get("f");
  if (!f) return null;
  const era = params.get("era");
  return {
    notation: f,
    bpm: Math.min(400, Math.max(20, Number(params.get("bpm")) || 100)),
    meter: params.get("m") ?? "4/4",
    era: era && Object.hasOwn(ERA_NAME, era) ? (era as Era) : DEFAULT_ERA,
  };
}

const initial = readHash() ?? { notation: PRESETS[0]!.notation, bpm: PRESETS[0]!.bpm, meter: "4/4", era: DEFAULT_ERA };
const initialMeter = ((m) => (typeof m === "string" ? FOUR_FOUR : m))(parseMeter(initial.meter));

function readPref(key: string): string | null {
  try {
    return localStorage.getItem(`compose-balance:${key}`);
  } catch {
    return null;
  }
}

function writePref(key: string, value: string) {
  try {
    localStorage.setItem(`compose-balance:${key}`, value);
  } catch {
    // Storage blocked (private window); the preference just won't persist.
  }
}

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName);
}

type Panel = "exchange" | "help" | null;

export function App() {
  const [sections, setSections] = useState<Section[]>(() => parse(initial.notation).sections);
  const [text, setText] = useState(() => format(parse(initial.notation).sections));
  const [errors, setErrors] = useState<string[]>([]);
  const [opts, setOpts] = useState<Options>({ bpm: initial.bpm, meter: initialMeter, era: initial.era });
  // The meter field keeps what was typed; opts.meter keeps the last valid meter.
  const [meterText, setMeterText] = useState(() => formatMeter(initialMeter));
  const [meterError, setMeterError] = useState<string | null>(null);
  // Each step's song and table, and the settings it changed with it (a preset's tempo, an
  // import's meter) as they were before, so undo puts those back too.
  const [undoStack, setUndoStack] = useState<{ sections: Section[]; pieces: Layout; settings?: Partial<Options> }[]>([]);
  // The shape table's pieces, and its width in the lattice's pixels at scale 1.
  const [tableWidth, setTableWidth] = useState(1500);
  const [pieces, setPieces] = useState<Layout>(() => flow(parse(initial.notation).sections, 1500));
  // Whether the table is still the app's own layout (true) or has been arranged by hand on the table.
  const [autoLayout, setAutoLayout] = useState(true);
  const [view, setViewState] = useState<"table" | "chart">(() => (readPref("view") === "chart" ? "chart" : "table"));
  function setView(v: "table" | "chart") {
    setViewState(v);
    writePref("view", v);
  }
  const [highlight, setHighlight] = useState<number[]>([]);
  const [playBar, setPlayBar] = useState(-1);
  const [panel, setPanel] = useState<Panel>(null);
  // Bumped by the verdict's link to open the board's first pinned note.
  const [openFirst, setOpenFirst] = useState(0);
  const [openShelf, setOpenShelf] = useState(0);
  // Phones: the toolbar's settings row, shown on demand.
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shears, setShears] = useState(false);
  // The chart is the main editor; text entry is opt-in and remembered per browser.
  const [typing, setTypingState] = useState(() => readPref("typing") === "1");
  function setTyping(on: boolean) {
    setTypingState(on);
    writePref("typing", on ? "1" : "0");
    // Leaving text mode with a half-typed form shows the last valid one.
    if (!on) {
      setText(format(sections));
      setErrors([]);
    }
  }
  const player = useRef<Player | null>(null);
  /** The page's sky; the shape table moves it so its cells are the table's. */
  const sky = useRef<HexSky>(null);

  const report = useMemo(() => analyze(sections, opts), [sections, opts]);
  const playing = playBar >= 0;

  useEffect(() => {
    const m = encodeURIComponent(formatMeter(opts.meter));
    // The default era stays out of the URL, so older links and new ones read the same.
    const era = opts.era && opts.era !== DEFAULT_ERA ? `&era=${opts.era}` : "";
    window.history.replaceState(null, "", `#f=${encodeURIComponent(format(sections))}&bpm=${opts.bpm}&m=${m}${era}`);
  }, [sections, opts.bpm, opts.meter, opts.era]);

  useEffect(() => () => player.current?.stop(), []);

  // Space plays/stops, Cmd/Ctrl+Z undoes, Escape closes a panel — except while typing in a field.
  const keys = useRef({ togglePlay: () => {}, undo: () => {}, close: () => {} });
  keys.current = {
    togglePlay: () => (playing ? stop() : play()),
    undo,
    close: () => {
      setPanel(null);
      setShears(false);
    },
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // The form field's own Escape leaves Text, and only that.
      if (e.key === "Escape") return e.target instanceof HTMLElement && e.target.id === "notation" ? undefined : keys.current.close();
      if (isTyping(e.target)) return;
      if (e.key === " " && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault();
        keys.current.togglePlay();
      } else if (e.key === "z" && (e.metaKey || e.ctrlKey) && !e.shiftKey) {
        e.preventDefault();
        keys.current.undo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /** The table's pieces for a new song: kept where only lengths changed, laid out afresh otherwise. */
  function piecesFor(next: Section[]): Layout {
    return sync(pieces, next, tableWidth);
  }

  /**
   * Every structural edit goes through here so undo, the text box and the table stay in sync.
   * `settings` are changed in the same undo step (a preset's tempo, an import's meter).
   */
  function update(next: Section[], nextPieces?: Layout, settings?: Partial<Options>) {
    const before = settings && (Object.fromEntries(Object.keys(settings).map((k) => [k, opts[k as keyof Options]])) as Partial<Options>);
    setUndoStack((h) => [...h.slice(-49), { sections, pieces, settings: before }]);
    if (settings) applySettings(settings);
    setSections(next);
    setPieces(nextPieces ?? piecesFor(next));
    // Pieces handed in come from the table itself: the user has arranged them. An edit made
    // elsewhere that changes which sections there are lays the table out afresh.
    const reshaped = next.length !== sections.length || next.some((x, i) => x.role !== sections[i]!.role);
    setAutoLayout(nextPieces === undefined ? autoLayout || reshaped : false);
    setText(format(next));
    setErrors([]);
    stop();
  }

  function onText(value: string) {
    setText(value);
    const result = parse(value);
    setErrors(result.errors);
    if (result.errors.length === 0 && format(result.sections) !== format(sections)) {
      setUndoStack((h) => [...h.slice(-49), { sections, pieces }]);
      setSections(result.sections);
      setPieces(piecesFor(result.sections));
      stop();
    }
  }

  function undo() {
    const prev = undoStack[undoStack.length - 1];
    if (!prev) return;
    setUndoStack((h) => h.slice(0, -1));
    if (prev.settings) applySettings(prev.settings);
    setSections(prev.sections);
    setPieces(prev.pieces);
    setText(format(prev.sections));
    setErrors([]);
    stop();
  }

  /** Tempo, meter or era set as part of an edit or its undo; the meter field shows the meter set. */
  function applySettings(settings: Partial<Options>) {
    setOpts((o) => ({ ...o, ...settings }));
    if (settings.meter) {
      setMeterText(formatMeter(settings.meter));
      setMeterError(null);
    }
  }

  /** Every section laid out again, neatly, in song order. */
  function tidy() {
    update(sections, flow(sections, tableWidth));
    // Tidied, the table is the app's layout again: it reflows when the window changes.
    setAutoLayout(true);
    setSettingsOpen(false);
  }

  function loadPreset(name: string) {
    const p = PRESETS.find((x) => x.name === name);
    if (!p) return;
    update(parse(p.notation).sections, undefined, { bpm: p.bpm });
  }

  function play(fromBar = 0) {
    if (sections.length === 0) return;
    player.current ??= new Player();
    player.current.play(sections, opts, setPlayBar, fromBar);
  }

  function stop() {
    player.current?.stop();
    setPlayBar(-1);
  }

  function setOption(patch: Partial<Options>) {
    stop();
    setOpts((o) => ({ ...o, ...patch }));
  }

  function onMeterText(value: string) {
    setMeterText(value);
    const parsed = parseMeter(value);
    if (typeof parsed === "string") return setMeterError(parsed);
    setMeterError(null);
    setOption({ meter: parsed });
  }

  const flashTimer = useRef(0);
  /** Scrolls the chart to a finding's sections and marks them briefly. */
  function jumpTo(indexes: number[]) {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById(`section-${indexes[0]}`)?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
    setHighlight(indexes);
    window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setHighlight([]), 1600);
  }

  const beatNote = tempoNote(opts.meter);
  const showHint = typing && errors.length === 0 && text.trim() === "";

  return (
    <div className="app">
      <hex-sky ref={sky} className="ground" />
      <Verdict
        report={report}
        empty={sections.length === 0}
        onOpenNotes={() => (view === "table" ? setOpenFirst((n) => n + 1) : document.getElementById("findings")?.scrollIntoView({ behavior: "smooth" }))}
        onOpenShelf={() => (view === "table" ? setOpenShelf((n) => n + 1) : document.getElementById("findings")?.scrollIntoView({ behavior: "smooth" }))}
      />

      <div className={`toolbar ${settingsOpen ? "settings-open" : ""}`}>
        <div className="toolbar-row">
          <button
            className="play"
            onClick={() => (playing ? stop() : play())}
            disabled={sections.length === 0}
            aria-pressed={playing}
          >
            <span className="play-icon" aria-hidden>
              {playing ? "■" : "▶"}
            </span>
            {playing ? "Stop" : "Play"}
          </button>
          <label className="tempo" title={`Tempo: ${beatNote.name} notes per minute`}>
            <span className="tempo-note" aria-hidden>
              {beatNote.symbol}
            </span>
            <input
              type="number"
              min={20}
              max={400}
              value={opts.bpm}
              aria-label={`Tempo in ${beatNote.name} notes per minute`}
              onChange={(e) => setOption({ bpm: Math.min(400, Math.max(20, Number(e.target.value) || 100)) })}
            />
            <span className="tempo-unit" aria-hidden>
              bpm
            </span>
          </label>
          <input
            className="meter"
            list="common-meters"
            value={meterText}
            aria-label="Time signature"
            aria-invalid={meterError !== null}
            title="Time signature: pick one or type any, like 7/8 or 2+2+3/8"
            spellCheck={false}
            autoComplete="off"
            onChange={(e) => onMeterText(e.target.value)}
            onFocus={(e) => e.target.select()}
            onBlur={() => !meterError && setMeterText(formatMeter(opts.meter))}
          />
          <datalist id="common-meters">
            {COMMON_METERS.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
          {sections.length > 0 && (
            <span className="duration" aria-label="Song length" title="Song length at this tempo and time signature">
              {playing && <>{formatSeconds(secondsFor(playBar, opts))} / </>}
              {formatSeconds(report.seconds)}
            </span>
          )}
          {/* Phones: one row of Play, the time, Undo and this; the rest opens below it. */}
          <button
            className="settings-toggle"
            aria-expanded={settingsOpen}
            aria-controls="toolbar-settings"
            onClick={() => setSettingsOpen((v) => !v)}
          >
            {settingsOpen ? "Close" : "Settings"}
          </button>
          <div className="toolbar-actions" id="toolbar-settings">
          <select
            className="era"
            value={opts.era ?? DEFAULT_ERA}
            aria-label="Compare against"
            title="Which hit songs the notes compare your form against"
            onChange={(e) => setOpts((o) => ({ ...o, era: e.target.value as Era }))}
          >
            {(Object.keys(ERA_NAME) as Era[]).map((era) => (
              <option key={era} value={era}>
                {ERA_NAME[era]}
              </option>
            ))}
          </select>
          {/* Both views named, the current one marked: a single button that names the other view reads as where you are. */}
          <div className="view-switch" role="group" aria-label="View">
            {(["table", "chart"] as const).map((v) => (
              <button key={v} aria-pressed={view === v} onClick={() => setView(v)}>
                {v === "table" ? "Table" : "Chart"}
              </button>
            ))}
          </div>
          <button
            className="shears-toggle"
            aria-label="Shears"
            onClick={() => setShears(!shears)}
            aria-pressed={shears}
            disabled={sections.length === 0}
            title="Shears: drag across a section to cut it at a barline, or across its shape to remove it"
          >
            <lattice-icon name="shears" />
            <span className="shears-label">Shears</span>
          </button>
          <button
            className="type-toggle"
            onClick={() => setTyping(!typing)}
            aria-pressed={typing}
            aria-controls="notation"
            title="Type the form as text, like Vs8 Ch8"
          >
            Text
          </button>
          <button className="undo" onClick={undo} disabled={undoStack.length === 0} title="Undo (Cmd/Ctrl+Z)" aria-label="Undo">
            <span className="undo-icon" aria-hidden>
              ↶
            </span>
            <span className="undo-label">Undo</span>
          </button>
          <Menu onPreset={loadPreset} onOpen={setPanel} />
          {view === "table" && pieces.pieces.length > 0 && (
            <button className="toolbar-tidy" onClick={tidy}>
              Tidy up
            </button>
          )}
          </div>
        </div>
        {typing && (
          <input
            id="notation"
            className="notation"
            aria-label="Form as text"
            aria-invalid={errors.length > 0}
            aria-describedby="notation-help"
            placeholder="Type a form, like In4 Vs8 Pre4 Ch8 Br8 Ch8 Out4"
            value={text}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            autoFocus
            onChange={(e) => onText(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setTyping(false)}
          />
        )}
        {((typing && errors.length > 0) || meterError) && (
          <ul className="errors" id="notation-help">
            {(typing ? errors : []).map((e) => (
              <li key={e}>{e}</li>
            ))}
            {meterError && <li>Time signature: {meterError}</li>}
          </ul>
        )}
        {showHint && (
          <p className="hint" id="notation-help">
            One code per section with its length in bars: <kbd>In4</kbd> intro, <kbd>Vs8</kbd> verse,{" "}
            <kbd>Pre4</kbd> pre-chorus, <kbd>Ch8</kbd> chorus, <kbd>Br8</kbd> bridge, <kbd>Out4</kbd> outro.
          </p>
        )}
      </div>

      {panel === "exchange" && (
        <Exchange
          sections={sections}
          opts={opts}
          onClose={() => setPanel(null)}
          onImport={(next, meter) => update(next, undefined, meter ? { meter } : undefined)}
        />
      )}
      {panel === "help" && <Help onClose={() => setPanel(null)} />}

      <div className="workspace">
        <main className="sheet" aria-label="Chart">
          {view === "table" ? (
            <LatticeTable
              sections={sections}
              layout={pieces}
              findings={report.findings}
              highlight={highlight}
              playBar={playBar}
              shears={shears}
              onChange={update}
              onWidth={(w) => {
                if (Math.abs(w - tableWidth) < 0.5) return;
                setTableWidth(w);
                // Lay out again for the new width, unless the user has arranged the table and it still fits.
                const tooWide = rightOf(pieces) > w;
                if (autoLayout || tooWide) setPieces(flow(sections, w));
              }}
              onPlayFrom={play}
              onShearsDone={() => setShears(false)}
              onApply={update}
              openFirst={openFirst}
              sky={sky}
              onStart={() => loadPreset(PRESETS[0]!.name)}
              openShelf={openShelf}
              onTidy={tidy}
            />
          ) : (
            <>
            <Chart
              sections={sections}
              highlight={highlight}
              findings={report.findings}
              playBar={playBar}
              onChange={update}
              onPlayFrom={play}
              shears={shears}
              onShearsDone={() => setShears(false)}
            />
              {/* The chart has no board to pin notes to: they follow it as a list. */}
              <section className="notes notes-below" id="findings" aria-label="Findings">
                <Findings findings={report.findings} empty={sections.length === 0} onApply={update} onHover={setHighlight} onJump={jumpTo} />
              </section>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
