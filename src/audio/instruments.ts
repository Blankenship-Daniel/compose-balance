/**
 * Every instrument the band can use, by part. All samples are public domain or CC0:
 * - smpldsnds.github.io, through smplr: Splendid Grand Piano (Akai, public domain),
 *   D. Smolken's double bass (CC0), the Versilian Community Sample Library (VCSL, CC0)
 *   and five drum machines (public domain)
 * - public/samples/, built by scripts/build-samples.ts from Karoryfer Samples, Versilian
 *   Studios' Osiris Piano and VSCO 2 Community Edition (all CC0)
 */
import type { Drum } from "./patterns.ts";

/** Keys play the chords, bass the chord roots, drums the groove, and the pad holds chords in the fuller sections. */
export type Part = "keys" | "bass" | "drums" | "pad";

export type Source =
  | { kind: "splendid" }
  | { kind: "smolken"; instrument: "Pizzicato" | "Arco" }
  | { kind: "vcsl"; instrument: string }
  | { kind: "drum-machine"; instrument: string; map: Record<Drum, string> }
  /** A preset in public/samples/<id>/, built by scripts/build-samples.ts. */
  | { kind: "local"; id: string };

export interface InstrumentDef {
  id: string;
  name: string;
  part: Part;
  source: Source;
  /** smplr's 0–127 volume; set by ear so parts balance whatever is picked. */
  volume: number;
  /** "accent": struck once at each section's start (bells), not held under every chord. */
  pad?: "sustain" | "accent";
}

const machine = (instrument: string, map: Record<Drum, string>): Source => ({ kind: "drum-machine", instrument, map });
const vcsl = (instrument: string): Source => ({ kind: "vcsl", instrument });
const local = (id: string): Source => ({ kind: "local", id });

export const INSTRUMENTS: InstrumentDef[] = [
  { id: "grand-piano", name: "Grand piano (Steinway)", part: "keys", source: { kind: "splendid" }, volume: 90 },
  { id: "osiris-piano", name: "Grand piano (Osiris)", part: "keys", source: local("osiris-piano"), volume: 100 },
  { id: "kawai-grand", name: "Grand piano (Kawai)", part: "keys", source: vcsl("Chordophones/Zithers/Grand Piano, Kawai"), volume: 100 },
  { id: "upright-piano", name: "Upright piano", part: "keys", source: vcsl("Chordophones/Zithers/Upright Piano, Yamaha"), volume: 100 },
  { id: "fm-piano", name: "FM electric piano (TX81Z)", part: "keys", source: vcsl("Electrophones/TX81Z - FM Piano"), volume: 95 },
  { id: "clean-guitar", name: "Electric guitar, clean", part: "keys", source: local("clean-guitar"), volume: 100 },
  { id: "shiny-guitar", name: "Electric guitar, bright", part: "keys", source: local("shiny-guitar"), volume: 100 },
  { id: "emily-guitar", name: "Acoustic-electric guitar", part: "keys", source: local("emily-guitar"), volume: 100 },
  { id: "harpsichord", name: "Harpsichord", part: "keys", source: vcsl("Chordophones/Zithers/Harpsichord, Flemish - 8'"), volume: 95 },
  { id: "harp", name: "Concert harp", part: "keys", source: vcsl("Chordophones/Composite Chordophones/Concert Harp"), volume: 100 },
  { id: "vibraphone", name: "Vibraphone", part: "keys", source: vcsl("Idiophones/Struck Idiophones/Vibraphone - Soft Mallets"), volume: 100 },
  { id: "marimba", name: "Marimba", part: "keys", source: vcsl("Idiophones/Struck Idiophones/Marimba"), volume: 100 },
  { id: "pipe-organ-keys", name: "Pipe organ", part: "keys", source: vcsl("Aerophones/Edge-blown Aerophones/Pipe Organ - Quiet"), volume: 85 },

  { id: "double-bass", name: "Double bass, plucked", part: "bass", source: { kind: "smolken", instrument: "Pizzicato" }, volume: 105 },
  { id: "double-bass-arco", name: "Double bass, bowed", part: "bass", source: { kind: "smolken", instrument: "Arco" }, volume: 100 },
  { id: "growlybass", name: "Electric bass (Growlybass)", part: "bass", source: local("growlybass"), volume: 105 },
  { id: "fashionbass", name: "Electric bass (Fashionbass)", part: "bass", source: local("fashionbass"), volume: 105 },
  { id: "black-and-blue-bass", name: "Electric bass (Black and Blue)", part: "bass", source: local("black-and-blue-bass"), volume: 105 },
  { id: "pastabass", name: "Six-string bass (Pastabass)", part: "bass", source: local("pastabass"), volume: 105 },
  { id: "war-tuba", name: "Tuba", part: "bass", source: local("war-tuba"), volume: 100 },

  {
    id: "lm-2",
    name: "LM-2 drum machine",
    part: "drums",
    source: machine("LM-2", {
      kick: "kick",
      snare: "snare-m",
      hihat: "hhclosed",
      "hihat-open": "hhopen",
      crash: "crash",
      "tom-1": "tom-h",
      "tom-2": "tom-m",
      "tom-3": "tom-l",
      "tom-4": "tom-ll",
    }),
    volume: 120,
  },
  {
    id: "tr-808",
    name: "TR-808 drum machine",
    part: "drums",
    source: machine("TR-808", {
      kick: "kick",
      snare: "snare",
      hihat: "hihat-close",
      "hihat-open": "hihat-open",
      crash: "cymbal",
      "tom-1": "tom-hi",
      "tom-2": "mid-tom",
      "tom-3": "tom-low",
      "tom-4": "tom-low",
    }),
    volume: 115,
  },
  {
    id: "rz-1",
    name: "Casio RZ-1 drum machine",
    part: "drums",
    source: machine("Casio-RZ1", {
      kick: "kick",
      snare: "snare",
      hihat: "hihat-closed",
      "hihat-open": "hihat-open",
      crash: "crash",
      "tom-1": "tom-1",
      "tom-2": "tom-2",
      "tom-3": "tom-3",
      "tom-4": "tom-3",
    }),
    volume: 115,
  },
  {
    id: "mfb-512",
    name: "MFB-512 drum machine",
    part: "drums",
    source: machine("MFB-512", {
      kick: "kick",
      snare: "snare",
      hihat: "hihat-closed",
      "hihat-open": "hihat-open",
      crash: "cymbal",
      "tom-1": "tom-hi",
      "tom-2": "tom-mid",
      "tom-3": "tom-low",
      "tom-4": "tom-low",
    }),
    volume: 115,
  },
  {
    id: "cr-8000",
    name: "CR-8000 drum machine",
    part: "drums",
    source: machine("Roland CR-8000", {
      kick: "kick",
      snare: "snare",
      hihat: "hihat-closed",
      "hihat-open": "hihat-open",
      crash: "cymball",
      "tom-1": "tom-high",
      "tom-2": "tom-high",
      "tom-3": "tom-low",
      "tom-4": "tom-low",
    }),
    volume: 115,
  },
  { id: "swirly-drums", name: "Acoustic kit (Swirly)", part: "drums", source: local("swirly-drums"), volume: 115 },
  { id: "big-rusty-drums", name: "Acoustic kit (Big Rusty)", part: "drums", source: local("big-rusty-drums"), volume: 115 },
  { id: "virtuosity-drums", name: "Acoustic kit (Virtuosity)", part: "drums", source: local("virtuosity-drums"), volume: 115 },

  { id: "strings", name: "String section", part: "pad", source: local("vsco-strings"), volume: 100, pad: "sustain" },
  { id: "cello", name: "Cello", part: "pad", source: local("cello"), volume: 100, pad: "sustain" },
  { id: "horns", name: "French horns", part: "pad", source: local("vsco-horns"), volume: 95, pad: "sustain" },
  { id: "woodwinds", name: "Flutes and clarinets", part: "pad", source: local("vsco-woodwinds"), volume: 95, pad: "sustain" },
  { id: "bear-sax", name: "Saxophones (Bear Sax)", part: "pad", source: local("bear-sax"), volume: 95, pad: "sustain" },
  { id: "weresax", name: "Saxophones (Weresax)", part: "pad", source: local("weresax"), volume: 95, pad: "sustain" },
  { id: "tenor-sax", name: "Tenor saxophone", part: "pad", source: vcsl("Aerophones/Reed Aerophones/Tenor Saxophone - Vibrato"), volume: 95, pad: "sustain" },
  { id: "pipe-organ", name: "Pipe organ", part: "pad", source: vcsl("Aerophones/Edge-blown Aerophones/Pipe Organ - Quiet"), volume: 80, pad: "sustain" },
  { id: "harmonica", name: "Harmonica", part: "pad", source: vcsl("Aerophones/Free Aerophones/Harmonica-Hohner-Special20-C - Normal"), volume: 90, pad: "sustain" },
  { id: "bowed-vibraphone", name: "Bowed vibraphone", part: "pad", source: vcsl("Idiophones/Struck Idiophones/Vibraphone - Bowed"), volume: 100, pad: "sustain" },
  { id: "tubular-bells", name: "Tubular bells", part: "pad", source: vcsl("Idiophones/Struck Idiophones/Tubular Bells 1"), volume: 95, pad: "accent" },
  { id: "glockenspiel", name: "Glockenspiel", part: "pad", source: vcsl("Idiophones/Struck Idiophones/Glockenspiel"), volume: 85, pad: "accent" },
];

export type BandChoice = Record<Part, string | null>;

export const DEFAULT_BAND: BandChoice = { keys: "grand-piano", bass: "double-bass", drums: "lm-2", pad: null };

export const PART_NAME: Record<Part, string> = { keys: "Chords", bass: "Bass", drums: "Drums", pad: "Pad" };

export function instrument(id: string | null): InstrumentDef | undefined {
  return INSTRUMENTS.find((i) => i.id === id);
}

/** A saved choice with unknown or wrong-part ids replaced by the defaults. */
export function validChoice(saved: Partial<Record<Part, unknown>> | null | undefined): BandChoice {
  const pick = (part: Part) => {
    const id = saved?.[part];
    if (part === "pad" && id === null) return null;
    return typeof id === "string" && instrument(id)?.part === part ? id : DEFAULT_BAND[part];
  };
  return { keys: pick("keys"), bass: pick("bass"), drums: pick("drums"), pad: pick("pad") };
}
