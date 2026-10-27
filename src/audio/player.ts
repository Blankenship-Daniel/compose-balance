import type { Options, Section } from "../core/types.ts";
import { secondsFor } from "../core/stats.ts";
import { CHORDS, LOOPS } from "./chords.ts";

const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

export class Player {
  private ctx: AudioContext | null = null;
  private raf = 0;

  get playing(): boolean {
    return this.ctx !== null;
  }

  /** Plays the form from `fromBar`. onBar receives the absolute bar number, or -1 when playback ends. */
  play(sections: Section[], opts: Options, onBar: (bar: number) => void, fromBar = 0): void {
    this.stop();
    const ctx = new AudioContext();
    this.ctx = ctx;
    const barDur = secondsFor(1, opts);
    // One click per written beat (7 in 7/8). When beats group (6/8 as 3+3, 7/8 as
    // 2+2+3), the first beat of each later group gets a medium accent.
    const { beats, groups } = opts.meter;
    const beat = barDur / beats;
    const groupStarts = new Set<number>();
    if (groups.some((g) => g > 1)) groups.slice(0, -1).reduce((at, g) => (groupStarts.add(at + g), at + g), 0);
    const t0 = ctx.currentTime + 0.1;
    const master = ctx.createGain();
    master.gain.value = 0.6;
    master.connect(ctx.destination);

    let bar = 0;
    for (const section of sections) {
      const loop = LOOPS[section.role];
      for (let b = 0; b < section.bars; b++, bar++) {
        if (bar < fromBar) continue;
        const start = t0 + (bar - fromBar) * barDur;
        this.chord(ctx, master, CHORDS[loop[b % 4]!]!, start, barDur);
        for (let k = 0; k < beats; k++) {
          const accent = k > 0 ? (groupStarts.has(k) ? 0.25 : 0) : b === 0 ? 2 : b % 4 === 0 ? 1 : 0.5;
          this.click(ctx, master, start + k * beat, accent);
        }
      }
    }
    const total = bar;

    const tick = () => {
      if (this.ctx !== ctx) return;
      const current = fromBar + Math.floor((ctx.currentTime - t0) / barDur);
      if (current >= total) {
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
    cancelAnimationFrame(this.raf);
    if (this.ctx) void this.ctx.close();
    this.ctx = null;
  }

  private chord(ctx: AudioContext, out: AudioNode, notes: number[], start: number, dur: number): void {
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.08, start + 0.02);
    gain.gain.setTargetAtTime(0.04, start + 0.05, 0.3);
    gain.gain.setTargetAtTime(0, start + dur - 0.08, 0.02);
    gain.connect(out);
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
