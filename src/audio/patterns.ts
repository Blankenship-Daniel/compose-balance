/**
 * What the band plays in each bar: drums, a bass line and piano chords, from the
 * section's role and the bar's chords. Times are fractions of the bar, so one
 * pattern fits any tempo; the meter's beat groups set where the pulses fall.
 */
import type { Meter } from "../core/meter.ts";
import type { Role } from "../core/types.ts";

/** Drum sounds; each kit maps them to its own samples (instruments.ts). Toms run high to low. */
export type Drum = "kick" | "snare" | "hihat" | "hihat-open" | "crash" | "tom-1" | "tom-2" | "tom-3" | "tom-4";

export type BandEvent =
  | { part: "drums"; sound: Drum; at: number; velocity: number }
  | { part: "bass" | "keys" | "pad"; notes: number[]; at: number; length: number; velocity: number };

/** A stretch of the bar under one chord: MIDI notes, bass first, or null for silence. */
export interface ChordSpan {
  notes: number[] | null;
  at: number;
  length: number;
}

/**
 * How hard each role drives, 1 (sparse) to 4 (full): choruses and solos play
 * the whole kit, pre-choruses build, intros and codas stay light. Hearing the
 * sections change is the point, so the contrast is deliberate.
 */
const ENERGY: Record<Role, 1 | 2 | 3 | 4> = {
  intro: 1,
  verse: 2,
  prechorus: 3,
  chorus: 4,
  postchorus: 4,
  bridge: 2,
  solo: 4,
  instrumental: 3,
  interlude: 2,
  transition: 3,
  outro: 2,
  coda: 1,
};

/** Where each felt pulse starts, as a fraction of the bar: [0, .25, .5, .75] in 4/4, [0, .5] in 6/8. */
export function pulses(meter: Meter): number[] {
  const out: number[] = [];
  meter.groups.reduce((at, g) => (out.push(at / meter.beats), at + g), 0);
  return out;
}

/** The bass an octave or two below the chord: G1 to F#2, the double bass's home range. */
const bassNote = (midi: number) => 31 + ((((midi - 31) % 12) + 12) % 12);

export interface BarContext {
  role: Role;
  /** This bar's place in its section, from 0. */
  bar: number;
  sectionBars: number;
  /** The song's last section: no fill leads out of it. */
  lastSection: boolean;
  /** How the pad plays, if there is one: held under each chord, or struck at each section's start. */
  pad?: "sustain" | "accent";
  meter: Meter;
  chords: ChordSpan[];
}

export function barEvents({ role, bar, sectionBars, lastSection, meter, chords, pad }: BarContext): BandEvent[] {
  const energy = ENERGY[role];
  const beats = pulses(meter);
  const out: BandEvent[] = [];
  const drum = (sound: Drum, at: number, velocity: number) => out.push({ part: "drums", sound, at, velocity });

  // A fill in the section's last bar hands over to the next one, so section boundaries are heard.
  const fill = energy >= 2 && !lastSection && sectionBars >= 2 && bar === sectionBars - 1;
  const fillFrom = fill ? beats[beats.length - 1]! : 1;

  if (bar === 0 && energy >= 3) drum("crash", 0, 100);
  beats.forEach((at, i) => {
    if (at >= fillFrom) return;
    const accent = i === 0 ? 10 : 0;
    // Kick on the strong pulses, snare on the backbeats. A bar of three pulses (3/4) waltzes: kick, then two light snares.
    if (i % 2 === 0 && !(beats.length === 3 && i > 0)) drum("kick", at, 95 + accent);
    else if (energy >= 2) drum("snare", at, beats.length === 3 ? 60 : 90);
    if (!(bar === 0 && energy >= 3 && i === 0)) drum("hihat", at, 55 + accent + energy * 5);
    const next = beats[i + 1] ?? 1;
    // Busier sections add the off-beat: the "and" of each pulse.
    if (energy >= 3 && next <= fillFrom) drum(energy === 4 && i === beats.length - 1 && bar % 2 === 1 ? "hihat-open" : "hihat", (at + next) / 2, 45);
  });
  if (energy === 4 && beats.length === 4 && 0.625 < fillFrom) drum("kick", 0.625, 70);
  if (fill) {
    const toms: Drum[] = ["tom-1", "tom-2", "tom-3", "tom-4"];
    const step = (1 - fillFrom) / 4;
    toms.forEach((t, k) => drum(energy >= 3 && k % 2 === 1 ? "snare" : t, fillFrom + k * step, 80 + k * 5));
  }

  // Bass and piano strike each chord, and again halfway through a long one in fuller sections.
  const middle = beats[Math.floor(beats.length / 2)] ?? 0.5;
  for (const span of chords) {
    if (!span.notes) continue;
    const strikes = [span.at];
    if (energy >= 2 && span.at < middle && span.at + span.length > middle + 1e-9 && beats.length > 1) strikes.push(middle);
    strikes.forEach((at, k) => {
      const length = (k + 1 < strikes.length ? strikes[k + 1]! : span.at + span.length) - at;
      out.push({ part: "bass", notes: [bassNote(span.notes![0]!)], at, length, velocity: 90 });
      // Quieter sections let the piano ring through the whole chord.
      if (energy >= 3) out.push({ part: "keys", notes: span.notes!, at, length, velocity: 55 + energy * 8 });
      else if (k === 0) out.push({ part: "keys", notes: span.notes!, at, length: span.length, velocity: 55 + energy * 8 });
    });
    // The pad lifts the fuller sections: it holds the chord's upper notes, an octave up,
    // or (bells) rings the chord once as each section starts.
    const lifted = energy >= 3 || role === "bridge";
    const upper = span.notes.filter((n) => n !== span.notes![0]).slice(-3).map((n) => n + 12);
    const voicing = upper.length ? upper : [span.notes[0]! + 12];
    if (pad === "sustain" && lifted) out.push({ part: "pad", notes: voicing, at: span.at, length: span.length, velocity: 70 });
    if (pad === "accent" && bar === 0 && span.at === 0 && energy >= 2) out.push({ part: "pad", notes: voicing, at: 0, length: 1, velocity: 80 });
  }
  return out;
}
