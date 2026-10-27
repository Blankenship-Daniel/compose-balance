import type { Options, Section } from "../core/types.ts";
import { secondsFor } from "../core/stats.ts";
import type { Band } from "./band.ts";
import { type BandChoice, DEFAULT_BAND, instrument } from "./instruments.ts";
import { barChords, CHORDS, harteNotes, LOOPS } from "./chords.ts";
import { barEvents, type ChordSpan } from "./patterns.ts";

const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

/** "band": sampled piano, bass and drums. "synth": the built-in chords and a click on every beat. */
export type Sound = "band" | "synth";

/** How far ahead bars are handed to the audio clock. Short, so Stop is quick. */
const LOOKAHEAD = 0.4;

interface Bar {
  section: Section;
  /** The bar's place in its section. */
  b: number;
  lastSection: boolean;
  chords: ChordSpan[];
}

/** Every bar of the form with its chords: a real song's where it has them, else the role's placeholder loop. */
function barsOf(sections: Section[]): Bar[] {
  const bars: Bar[] = [];
  let carried: string | null = null; // a real song's chord, held into the next bar by "."
  sections.forEach((section, i) => {
    for (let b = 0; b < section.bars; b++) {
      const real = section.chords?.[b];
      let chords: ChordSpan[];
      if (real !== undefined) {
        const timed = barChords(real, carried);
        carried = timed.at(-1)?.chord ?? carried;
        chords = timed.map(({ chord, at, length }) => ({ notes: chord ? harteNotes(chord) : null, at, length }));
      } else chords = [{ notes: CHORDS[LOOPS[section.role][b % 4]!]!, at: 0, length: 1 }];
      bars.push({ section, b, lastSection: i === sections.length - 1, chords });
    }
  });
  return bars;
}

export class Player {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  /** This playback's synth voices and clicks; disconnecting it silences them. */
  private bus: GainNode | null = null;
  private band: Band | null = null;
  private timer = 0;
  private raf = 0;
  /** Bumped by every play and stop, so a play still waiting on samples knows it was cancelled. */
  private run = 0;

  get playing(): boolean {
    return this.bus !== null;
  }

  /**
   * Plays the form from `fromBar`. onBar receives the absolute bar number, or -1 when
   * playback ends. With the band, the first play waits for its samples (onLoading);
   * if they can't load, it plays the synth instead.
   */
  async play(
    sections: Section[],
    opts: Options,
    onBar: (bar: number) => void,
    fromBar = 0,
    {
      sound = "band",
      band: choice = DEFAULT_BAND,
      onLoading = () => {},
    }: { sound?: Sound; band?: BandChoice; onLoading?: (loading: boolean) => void } = {},
  ): Promise<void> {
    this.stop();
    const run = this.run;
    // One context for the session: the band's samples are decoded into it.
    const ctx = (this.ctx ??= new AudioContext());
    if (!this.master) {
      this.master = ctx.createGain();
      this.master.gain.value = 0.6;
      this.master.connect(ctx.destination);
    }
    const master = this.master;
    void ctx.resume();

    let band: Band | null = null;
    if (sound === "band") {
      onLoading(true);
      // The sampler library loads with the samples, so the page itself stays light.
      band = await import("./band.ts").then(({ loadBand }) => loadBand(ctx, master, choice)).catch(() => null);
      onLoading(false);
      if (run !== this.run) return; // stopped, or played again, while the samples loaded
    }
    this.band = band;
    const bus = ctx.createGain();
    bus.connect(master);
    this.bus = bus;

    const barDur = secondsFor(1, opts);
    const bars = barsOf(sections);
    const padStyle = instrument(choice.pad)?.pad;
    const t0 = ctx.currentTime + 0.1;
    let next = fromBar;

    const schedule = () => {
      while (next < bars.length && t0 + (next - fromBar) * barDur < ctx.currentTime + LOOKAHEAD) {
        const start = t0 + (next - fromBar) * barDur;
        if (band) this.bandBar(band, bars[next]!, opts, start, barDur, padStyle);
        else this.synthBar(ctx, bus, bars[next]!, opts, start, barDur);
        next++;
      }
    };
    schedule();
    this.timer = window.setInterval(schedule, 50);

    const tick = () => {
      if (run !== this.run) return;
      const current = fromBar + Math.floor((ctx.currentTime - t0) / barDur);
      if (current >= bars.length) {
        this.stop();
        onBar(-1);
        return;
      }
      onBar(Math.max(fromBar, current));
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop(): void {
    this.run++;
    clearInterval(this.timer);
    cancelAnimationFrame(this.raf);
    this.bus?.disconnect();
    this.bus = null;
    if (this.band) for (const voice of [this.band.keys, this.band.bass, this.band.drums, this.band.pad]) voice?.stop();
    this.band = null;
  }

  private bandBar(band: Band, bar: Bar, opts: Options, start: number, barDur: number, pad?: "sustain" | "accent"): void {
    const events = barEvents({
      role: bar.section.role,
      bar: bar.b,
      sectionBars: bar.section.bars,
      lastSection: bar.lastSection,
      meter: opts.meter,
      chords: bar.chords,
      pad: band.pad ? pad : undefined,
    });
    for (const e of events) {
      const time = start + e.at * barDur;
      // A drum machine names its own sounds; a sampled kit answers to the generic names.
      if (e.part === "drums") band.drums?.start({ note: band.drumMap?.[e.sound] ?? e.sound, time, velocity: e.velocity });
      else for (const note of e.notes) band[e.part]?.start({ note, time, duration: e.length * barDur, velocity: e.velocity });
    }
  }

  /** The built-in sound: a triangle-wave chord per span and a click on every beat. */
  private synthBar(ctx: AudioContext, out: AudioNode, bar: Bar, opts: Options, start: number, barDur: number): void {
    for (const { notes, at, length } of bar.chords) if (notes) this.chord(ctx, out, notes, start + at * barDur, length * barDur);
    // One click per written beat (7 in 7/8). When beats group (6/8 as 3+3, 7/8 as
    // 2+2+3), the first beat of each later group gets a medium accent.
    const { beats, groups } = opts.meter;
    const groupStarts = new Set<number>();
    if (groups.some((g) => g > 1)) groups.slice(0, -1).reduce((at, g) => (groupStarts.add(at + g), at + g), 0);
    for (let k = 0; k < beats; k++) {
      const accent = k > 0 ? (groupStarts.has(k) ? 0.25 : 0) : bar.b === 0 ? 2 : bar.b % 4 === 0 ? 1 : 0.5;
      this.click(ctx, out, start + (k * barDur) / beats, accent);
    }
  }

  private chord(ctx: AudioContext, out: AudioNode, notes: number[], start: number, dur: number): void {
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.08, start + 0.02);
    gain.gain.setTargetAtTime(0.04, start + 0.05, 0.3);
    gain.gain.setTargetAtTime(0, start + dur - 0.08, 0.02);
    gain.connect(out);
    // notes[0] is the bass: the root, or an inversion's lowest note.
    for (const n of [notes[0]! - 24, ...notes]) {
      const osc = ctx.createOscillator();
      osc.type = n < notes[0]! ? "sine" : "triangle";
      osc.frequency.value = hz(n);
      osc.connect(gain);
      osc.start(start);
      osc.stop(start + dur);
    }
  }

  /** accent: 2 = section start, 1 = start of a 4-bar phrase, 0.5 = downbeat, 0.25 = start of a beat group (beat 4 of 6/8), 0 = other beats. */
  private click(ctx: AudioContext, out: AudioNode, at: number, accent: number): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = accent === 2 ? 1760 : accent === 1 ? 1320 : accent === 0.5 ? 1000 : accent === 0.25 ? 900 : 800;
    const peak = accent === 2 ? 0.5 : accent === 1 ? 0.35 : accent === 0.5 ? 0.22 : accent === 0.25 ? 0.16 : 0.1;
    gain.gain.setValueAtTime(peak, at);
    gain.gain.exponentialRampToValueAtTime(0.001, at + 0.06);
    osc.connect(gain).connect(out);
    osc.start(at);
    osc.stop(at + 0.07);
  }
}
