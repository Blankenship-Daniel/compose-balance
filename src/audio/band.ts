/**
 * Loads the band's instruments through smplr (MIT), each the first time it plays;
 * the browser caches the samples after that. See instruments.ts for what each one is.
 */
import { DrumMachine, Sampler, type SmplrPreset, Smolken, SplendidGrandPiano, Versilian } from "smplr";
import { type BandChoice, type InstrumentDef, instrument, type Part } from "./instruments.ts";
import type { Drum } from "./patterns.ts";

/** What the player needs from a loaded instrument. */
export interface Voice {
  start(event: { note: string | number; time: number; duration?: number; velocity: number }): void;
  stop(): void;
}

export type Band = Partial<Record<Part, Voice>> & { drumMap?: Record<Drum, string> };

/** Every third semitone across each part's range; the rest pitch-shift from the nearest. */
const range = (from: number, to: number) => Array.from({ length: Math.floor((to - from) / 3) + 1 }, (_, i) => from + i * 3);
const NOTES: Record<Exclude<Part, "drums">, number[]> = {
  keys: range(42, 90),
  bass: range(28, 49),
  pad: range(54, 96),
};

/** The instrument, once its samples are in. */
async function create(ctx: AudioContext, destination: AudioNode, def: InstrumentDef): Promise<Voice> {
  const base = { destination, volume: def.volume };
  const notesToLoad = def.part === "drums" ? undefined : { notes: NOTES[def.part], fallback: "nearest" as const };
  const s = def.source;
  switch (s.kind) {
    case "splendid": {
      return SplendidGrandPiano(ctx, { ...base, notesToLoad: { ...notesToLoad, velocityRange: [60, 90] } }).load;
    }
    case "smolken": {
      return Smolken(ctx, { ...base, instrument: s.instrument, notesToLoad }).load;
    }
    case "vcsl": {
      return Versilian(ctx, { ...base, instrument: s.instrument, notesToLoad }).load;
    }
    case "drum-machine": {
      return DrumMachine(ctx, { ...base, instrument: s.instrument }).load;
    }
    case "local": {
      const url = `${import.meta.env.BASE_URL}samples/${s.id}/preset.json`;
      const preset = (await (await fetch(url)).json()) as SmplrPreset;
      // The preset names its samples relative to its own folder.
      preset.samples.baseUrl = new URL(preset.samples.baseUrl, new URL(url, location.href)).href;
      return Sampler(ctx, { ...base, preset }).load;
    }
  }
}

const loaded = new Map<string, Promise<Voice | null>>();

/** One instrument, loaded once per session. null if it can't load in time; it is retried on the next play. */
function load(ctx: AudioContext, destination: AudioNode, def: InstrumentDef, timeoutMs: number): Promise<Voice | null> {
  let promise = loaded.get(def.id);
  if (!promise) {
    promise = (async () => {
      const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs));
      const result = await Promise.race([create(ctx, destination, def), timeout]).catch(() => null);
      if (!result) loaded.delete(def.id);
      return result;
    })();
    loaded.set(def.id, promise);
  }
  return promise;
}

/**
 * The chosen band for this audio context. A part that can't load stays silent;
 * if none loads (offline, blocked), this is null and playback falls back to the synth.
 */
export async function loadBand(ctx: AudioContext, destination: AudioNode, choice: BandChoice, timeoutMs = 20_000): Promise<Band | null> {
  const parts = (Object.keys(choice) as Part[]).flatMap((part) => {
    const def = instrument(choice[part]);
    return def ? [{ part, def }] : [];
  });
  const voices = await Promise.all(parts.map(({ def }) => load(ctx, destination, def, timeoutMs)));
  const band: Band = {};
  parts.forEach(({ part, def }, i) => {
    if (!voices[i]) return;
    band[part] = voices[i]!;
    if (def.source.kind === "drum-machine") band.drumMap = def.source.map;
  });
  return Object.keys(band).length ? band : null;
}
