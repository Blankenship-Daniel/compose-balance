/**
 * Builds the self-hosted band instruments in public/samples/<id>/: a few samples per
 * instrument, trimmed and encoded as mono AAC, and a smplr preset (preset.json) that
 * maps them. Sources are CC0 sample libraries on GitHub, pinned to a commit; see
 * LIBRARIES below and src/audio/instruments.ts.
 *
 *   node scripts/build-samples.ts <cache-dir> [instrument-id ...]
 *
 * Downloads go to <cache-dir> (keep it outside the repo); needs ffmpeg on PATH.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, posix } from "node:path";
import type { Drum } from "../src/audio/patterns.ts";
import { peakDb } from "./audio-level.ts";

type Range = [number, number];

interface Pitched {
  kind: "pitched";
  /** Notes to sample: every third semitone in this range; smplr pitch-shifts between them. */
  notes: Range;
  /** How long each note may ring, in seconds; longer is trimmed with a short fade. */
  seconds: number;
}

interface Kit {
  kind: "drums";
  /** The SFZ key that plays each of the band's drum sounds. */
  keys: Record<Drum, number>;
  seconds: number;
}

interface Library {
  id: string;
  repo: string;
  commit: string;
  license: string;
  description: string;
  /** SFZ programs, relative to the repo root; their regions are pooled. */
  sfz?: string[];
  /** Or, for sample sets without SFZ (VSCO 2 CE): folders whose file names carry the note. */
  folders?: string[];
  /** The note-name octave for middle C in `folders` file names (VSCO: C3). */
  middleC?: number;
  /** A velocity to pick layers at, 1–127. */
  velocity: number;
  /** Controller values the SFZ assumes (mic mixes, articulations); others default to 0. */
  cc?: Record<number, number>;
  /** Keyswitch to hold, for SFZ programs that need one. */
  keyswitch?: number;
  /**
   * Octaves the samples really sound away from where the SFZ maps them, measured by
   * ear-checking the built files: some programs map basses an octave up, as bass parts are written.
   */
  octave?: number;
  play: Pitched | Kit;
}

const keys = (from: number, to: number): Pitched => ({ kind: "pitched", notes: [from, to], seconds: 3 });
const bass: Pitched = { kind: "pitched", notes: [28, 49], seconds: 2.5 };
const pad: Pitched = { kind: "pitched", notes: [54, 96], seconds: 4 };
const GM_KIT: Record<Drum, number> = {
  kick: 36,
  snare: 38,
  hihat: 42,
  "hihat-open": 46,
  crash: 49,
  "tom-1": 50,
  "tom-2": 48,
  "tom-3": 45,
  "tom-4": 43,
};
const KARORYFER = "CC0-1.0 (Karoryfer Samples)";

export const LIBRARIES: Library[] = [
  {
    id: "osiris-piano",
    repo: "sfzinstruments/Osiris_Piano",
    commit: "18c6afccb60cff458edbf7c394571783e074e1e9",
    license: "CC0-1.0 (Versilian Studios and Karoryfer Samples)",
    description: "Osiris Piano, natural",
    sfz: ["Programs/01-natural.sfz"],
    velocity: 90,
    play: keys(42, 90),
  },
  {
    id: "clean-guitar",
    repo: "sfzinstruments/karoryfer.black-and-green-guitars",
    commit: "b3b3249d37dc977a1a297bd2dc053e6d9b6b805c",
    license: KARORYFER,
    description: "Black and Green Guitars, green, sustained",
    sfz: ["Programs/04-green_twang.sfz"],
    velocity: 90,
    play: keys(40, 84),
  },
  {
    id: "shiny-guitar",
    repo: "sfzinstruments/karoryfer.shinyguitar",
    commit: "57243cca85277dbcc120ce17c6178032f93c80f3",
    license: KARORYFER,
    description: "Shinyguitar, electric",
    sfz: ["Programs/electric_one.sfz"],
    velocity: 90,
    play: keys(40, 84),
  },
  {
    id: "emily-guitar",
    repo: "sfzinstruments/karoryfer.emilyguitar",
    commit: "b4920dc662fd9cad6dcaccdeecffdd91c8725d8c",
    license: KARORYFER,
    description: "Emilyguitar, clean",
    sfz: ["emily_clean.sfz"],
    velocity: 90,
    play: keys(40, 84),
  },
  {
    id: "growlybass",
    repo: "sfzinstruments/karoryfer.growlybass",
    commit: "4f483268fc66b5a6d5781d421c0d11b8d08d3fc6",
    license: KARORYFER,
    description: "Growlybass, clean",
    sfz: ["growlybass_clean.sfz"],
    octave: -1,
    velocity: 100,
    play: bass,
  },
  {
    id: "fashionbass",
    repo: "sfzinstruments/karoryfer.fashionbass",
    commit: "0703973b300a6bacb837602be9b588ab64732a72",
    license: KARORYFER,
    description: "Fashionbass, clean",
    sfz: ["fashionbass_clean.sfz"],
    velocity: 100,
    play: bass,
  },
  {
    id: "black-and-blue-bass",
    repo: "sfzinstruments/karoryfer.black-and-blue-basses",
    commit: "6e7d674cdb41be7a54dbccb15472401ad01099b9",
    license: KARORYFER,
    description: "Black and Blue Basses, dark black, plucked",
    sfz: ["Programs/05-darkblack_pluck.sfz"],
    octave: -1,
    velocity: 100,
    play: bass,
  },
  {
    id: "pastabass",
    repo: "sfzinstruments/karoryfer.pastabass",
    commit: "90135cd026db5d4fa0fe538240b4203f085f5244",
    license: KARORYFER,
    description: "Pastabass, spaghetti",
    sfz: ["spaghetti.sfz"],
    octave: -1,
    velocity: 100,
    play: bass,
  },
  {
    id: "war-tuba",
    repo: "sfzinstruments/karoryfer.war-tuba",
    commit: "5b62dd6ef6b00281bb734769e44a63f5e013018a",
    license: KARORYFER,
    description: "War Tuba, solo",
    sfz: ["Programs/2-solo-poly.sfz"],
    velocity: 100,
    play: bass,
  },
  {
    id: "swirly-drums",
    repo: "sfzinstruments/karoryfer.swirly-drums",
    commit: "c40dafe0011cb2e54c0c220ff0fa308a11fc60f5",
    license: KARORYFER,
    description: "Swirly Drums, basic kit",
    sfz: ["Programs/Basic_kit.sfz"],
    velocity: 100,
    // Three toms; the closed hi-hat is "tight", and "closed" is the looser one.
    play: { kind: "drums", keys: { ...GM_KIT, "hihat-open": 46, "tom-1": 47, "tom-2": 45, "tom-3": 41, "tom-4": 41 }, seconds: 2.5 },
  },
  {
    id: "big-rusty-drums",
    repo: "sfzinstruments/karoryfer.big-rusty-drums",
    commit: "f07ce00df34a46b6b08375be56fe116cf15782bc",
    license: KARORYFER,
    description: "Big Rusty Drums, basic kit",
    sfz: ["Programs/02-basic.sfz"],
    velocity: 100,
    // Three toms: 14, 15 and 18 inch.
    play: { kind: "drums", keys: { ...GM_KIT, "tom-1": 47, "tom-2": 45, "tom-3": 43, "tom-4": 43 }, seconds: 2.5 },
  },
  {
    id: "virtuosity-drums",
    repo: "sfzinstruments/virtuosity_drums",
    commit: "9f04cf9a734527edfbb0a4eee1f674e45bbf71bc",
    license: "CC0-1.0 (Versilian Studios and Karoryfer Samples)",
    description: "Virtuosity Drums, basic kit",
    sfz: ["Programs/01-basic-kit.sfz"],
    velocity: 100,
    // Two toms, each struck centre and off-centre.
    play: { kind: "drums", keys: { ...GM_KIT, "tom-1": 48, "tom-2": 50, "tom-3": 41, "tom-4": 43 }, seconds: 2.5 },
  },
  {
    id: "cello",
    repo: "sfzinstruments/karoryfer-bigcat.cello",
    commit: "6fd75fbfc1dbb3109bf26220ba1adea46188a18b",
    license: "CC0-1.0 (Karoryfer Samples and Bigcat Instruments)",
    description: "Cello, bowed",
    sfz: ["Programs/01- Bowed (velocity layer).sfz"],
    octave: 1,
    velocity: 90,
    play: { ...pad, notes: [36, 76] },
  },
  {
    id: "bear-sax",
    repo: "sfzinstruments/karoryfer.bear-sax",
    commit: "7abb3c652525a15dfac80e1b5dfbba9964ee568f",
    license: KARORYFER,
    description: "Bear Sax, solo",
    sfz: ["Programs/2-solo-poly.sfz"],
    velocity: 90,
    play: { ...pad, notes: [44, 80] },
  },
  {
    id: "weresax",
    repo: "sfzinstruments/karoryfer.weresax",
    commit: "a4d756b21d2a573aca0d840cce7e71ba5effd4c6",
    license: KARORYFER,
    description: "Weresax, alto",
    sfz: ["Programs/Sax.sfz"],
    velocity: 90,
    play: { ...pad, notes: [49, 81] },
  },
  {
    id: "vsco-strings",
    repo: "sgossner/VSCO-2-CE",
    commit: "440300901dfe9275fd84e0b7763af1f8443ae62e",
    license: "CC0-1.0 (Versilian Studios, VSCO 2 Community Edition)",
    description: "VSCO 2 CE violin and viola sections, sustained with vibrato",
    folders: ["Strings/Violin Section/susVib", "Strings/Viola Section/susvib"],
    middleC: 3,
    velocity: 90,
    play: pad,
  },
  {
    id: "vsco-horns",
    repo: "sgossner/VSCO-2-CE",
    commit: "440300901dfe9275fd84e0b7763af1f8443ae62e",
    license: "CC0-1.0 (Versilian Studios, VSCO 2 Community Edition)",
    description: "VSCO 2 CE French horn, sustained",
    folders: ["Brass/F Horn/sus"],
    middleC: 3,
    velocity: 90,
    play: { ...pad, notes: [42, 78] },
  },
  {
    id: "vsco-woodwinds",
    repo: "sgossner/VSCO-2-CE",
    commit: "440300901dfe9275fd84e0b7763af1f8443ae62e",
    license: "CC0-1.0 (Versilian Studios, VSCO 2 Community Edition)",
    description: "VSCO 2 CE flute and clarinet, sustained",
    folders: ["Woodwinds/Flute/susvib", "Woodwinds/Clarinet/susLong"],
    middleC: 3,
    velocity: 90,
    play: pad,
  },
];

// ---------------------------------------------------------------------------
// SFZ

export interface Region {
  sample: string;
  lokey: number;
  hikey: number;
  center: number;
  lovel: number;
  hivel: number;
  /** Semitones to add to the sample's pitch (transpose + tune/100). */
  shift: number;
  /** Gain in dB. */
  volume: number;
  trigger: string;
  seq: number;
  lorand: number;
  hirand: number;
  cc: Record<number, Range>;
  /** Keyswitch range and the key that selects this region (sw_last). */
  sw?: { last?: number; lo?: number; hi?: number; default?: number };
}

const NOTE = /^([a-gA-G])([#b]?)(-?\d+)$/;
const PITCH: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };

/** "c4" → 60 (SFZ's middle C), "60" → 60. */
export function sfzKey(value: string, middleC = 4): number {
  const n = Number(value);
  if (!Number.isNaN(n)) return n;
  const m = NOTE.exec(value.trim());
  if (!m) throw new Error(`Not a key: ${value}`);
  return PITCH[m[1]!.toLowerCase()]! + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0) + (Number(m[3]) - middleC + 5) * 12;
}

/**
 * The regions of an SFZ program, with <global>, <master> and <group> opcodes inherited,
 * #include and #define resolved, and sample paths made relative to the repo root.
 */
export function parseSfz(path: string, read: (path: string) => string): { regions: Region[]; cc: Record<number, number> } {
  const defines = new Map<string, string>();
  const cc: Record<number, number> = {};
  let defaultPath = "";
  const regions: Region[] = [];
  const level: Record<string, Record<string, string>> = { global: {}, master: {}, group: {}, region: {} };
  let current: string | null = null;
  const root = posix.dirname(path);

  const flush = () => {
    if (current !== "region") return;
    const op = { ...level.global, ...level.master, ...level.group, ...level.region };
    if (op.sample) regions.push(toRegion(op, root, defaultPath));
  };

  const load = (file: string) => {
    let text = read(file)
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/\/\/.*$/gm, " ");
    for (const raw of text.split(/\r?\n/)) {
      let line = raw.trim();
      const def = /^#define\s+(\$\w+)\s+(.*)$/.exec(line);
      if (def) {
        defines.set(def[1]!, def[2]!.trim());
        continue;
      }
      line = line.replace(/\$\w+/g, (v) => defines.get(v) ?? v);
      const inc = /^#include\s+"([^"]+)"/.exec(line);
      if (inc) {
        load(posix.normalize(posix.join(root, inc[1]!.replace(/\\/g, "/"))));
        continue;
      }
      // Headers and opcodes can share a line; opcode values may hold spaces (sample paths).
      for (const part of line.split(/(?=<\w+>)/)) {
        const header = /^<(\w+)>/.exec(part);
        let body = part;
        if (header) {
          flush();
          current = header[1]!;
          body = part.slice(header[0].length);
          if (current === "global") level.global = {}, level.master = {}, level.group = {};
          if (current === "master") level.master = {}, level.group = {};
          if (current === "group") level.group = {};
          if (current === "region") level.region = {};
        }
        const ops = [...body.matchAll(/(\w+)=/g)];
        ops.forEach((m, i) => {
          const value = body.slice(m.index! + m[0].length, ops[i + 1]?.index ?? body.length).trim();
          const key = m[1]!;
          if (current === "control") {
            if (key === "default_path") defaultPath = value.replace(/\\/g, "/");
            if (key.startsWith("set_cc")) cc[Number(key.slice(6))] = Number(value);
          } else if (current && level[current]) level[current]![key] = value;
        });
      }
    }
  };
  load(path);
  flush();
  return { regions, cc };
}

function toRegion(op: Record<string, string>, root: string, defaultPath: string): Region {
  const key = op.key !== undefined ? sfzKey(op.key) : undefined;
  const lokey = op.lokey !== undefined ? sfzKey(op.lokey) : (key ?? 0);
  const hikey = op.hikey !== undefined ? sfzKey(op.hikey) : (key ?? 127);
  const cc: Record<number, Range> = {};
  for (const [k, v] of Object.entries(op)) {
    const m = /^(lo|hi)cc(\d+)$/.exec(k);
    if (!m) continue;
    const n = Number(m[2]);
    cc[n] ??= [0, 127];
    cc[n]![m[1] === "lo" ? 0 : 1] = Number(v);
  }
  return {
    sample: posix.normalize(posix.join(root, defaultPath, op.sample!.replace(/\\/g, "/"))),
    lokey,
    hikey,
    center: op.pitch_keycenter !== undefined ? sfzKey(op.pitch_keycenter) : (key ?? lokey),
    lovel: Number(op.lovel ?? 1),
    hivel: Number(op.hivel ?? 127),
    shift: Number(op.transpose ?? 0) + Number(op.tune ?? 0) / 100,
    volume: Number(op.volume ?? 0),
    trigger: op.trigger ?? "attack",
    seq: Number(op.seq_position ?? 1),
    lorand: Number(op.lorand ?? 0),
    hirand: Number(op.hirand ?? 1),
    cc,
    sw:
      op.sw_last !== undefined || op.sw_lokey !== undefined
        ? {
            last: op.sw_last !== undefined ? sfzKey(op.sw_last) : undefined,
            lo: op.sw_lokey !== undefined ? sfzKey(op.sw_lokey) : undefined,
            hi: op.sw_hikey !== undefined ? sfzKey(op.sw_hikey) : undefined,
            default: op.sw_default !== undefined ? sfzKey(op.sw_default) : undefined,
          }
        : undefined,
  };
}

/** The regions that sound for a key at a velocity, as the program starts (first round robin, default controllers). */
export function sounding(regions: Region[], key: number, velocity: number, lib: Pick<Library, "cc" | "keyswitch">, defaults: Record<number, number> = {}): Region[] {
  const keyswitch = lib.keyswitch ?? regions.find((r) => r.sw?.default !== undefined)?.sw?.default;
  const seen = new Set<string>();
  return regions.filter(
    (r) =>
      r.lokey <= key &&
      key <= r.hikey &&
      r.lovel <= velocity &&
      velocity <= r.hivel &&
      r.trigger === "attack" &&
      r.seq === 1 &&
      r.lorand === 0 &&
      (r.sw?.last === undefined || r.sw.last === keyswitch) &&
      Object.entries(r.cc).every(([n, [lo, hi]]) => {
        const value = lib.cc?.[Number(n)] ?? defaults[Number(n)] ?? 0;
        return lo <= value && value <= hi;
      }) &&
      // "*silence" and "*noise" are SFZ's built-in generators, not files; one layer per file.
      !r.sample.split("/").pop()!.startsWith("*") &&
      !seen.has(r.sample) &&
      Boolean(seen.add(r.sample)),
  );
}

// ---------------------------------------------------------------------------
// Sample sets without SFZ: the note is in the file name ("VlnEns_susVib_A#3_v2.wav")

interface Named {
  sample: string;
  key: number;
  velocity: number;
  rr: number;
}

export function namedSamples(paths: string[], middleC: number): Named[] {
  return paths.flatMap((p) => {
    const name = posix.basename(p).replace(/\.(wav|flac)$/i, "");
    const parts = name.split("_");
    const note = parts.find((x) => NOTE.test(x));
    if (!note) return [];
    const v = Number(/^v(\d+)$/i.exec(parts.find((x) => /^v\d+$/i.test(x)) ?? "")?.[1] ?? 1);
    const rr = Number(/^rr(\d+)$/i.exec(parts.find((x) => /^rr\d+$/i.test(x)) ?? "")?.[1] ?? 1);
    return [{ sample: p, key: sfzKey(note, middleC), velocity: v, rr }];
  });
}

// ---------------------------------------------------------------------------
// Building

const raw = (lib: Library, path: string) =>
  `https://raw.githubusercontent.com/${lib.repo}/${lib.commit}/${path.split("/").map(encodeURIComponent).join("/")}`;

function fetchTo(url: string, dest: string): void {
  if (existsSync(dest)) return;
  mkdirSync(dirname(dest), { recursive: true });
  execFileSync("curl", ["-sfL", "--retry", "3", "--max-time", "120", "-o", dest, url]);
}

function treeOf(lib: Library, cache: string): string[] {
  const file = join(cache, "trees", `${lib.repo.replace("/", "_")}-${lib.commit}.json`);
  fetchTo(`https://api.github.com/repos/${lib.repo}/git/trees/${lib.commit}?recursive=1`, file);
  return (JSON.parse(readFileSync(file, "utf8")).tree as { path: string; type: string }[]).filter((t) => t.type === "blob").map((t) => t.path);
}

/** A planned output sample: the source files to mix, and the key it is pitched at. */
interface Planned {
  name: string;
  sources: { path: string; volume: number }[];
  /** The MIDI key the sample sounds at, after transpose/tune. */
  pitch: number;
  /** The keys it should cover (pitched), or the drum it plays. */
  keyRange?: Range;
  drum?: Drum;
}

function plan(lib: Library, cache: string): Planned[] {
  const dir = join(cache, "src", lib.id);
  const local = (p: string) => join(dir, p);
  if (lib.folders) {
    const tree = treeOf(lib, cache).filter((p) => lib.folders!.some((f) => p.startsWith(`${f}/`)) && /\.(wav|flac)$/i.test(p));
    const named = namedSamples(tree, lib.middleC ?? 4).filter((n) => n.rr === 1);
    if (lib.play.kind !== "pitched") throw new Error("Named sample sets are pitched");
    const [lo, hi] = lib.play.notes;
    const chosen = new Map<string, Named>();
    for (let key = lo; key <= hi; key += 3) {
      const near = [...named].sort((a, b) => Math.abs(a.key - key) - Math.abs(b.key - key) || Math.abs(a.velocity - 2) - Math.abs(b.velocity - 2))[0];
      if (near && Math.abs(near.key - key) <= 4) chosen.set(near.sample, near);
    }
    return withRanges(
      [...chosen.values()].map((n, i) => ({ name: `${lib.id}-${i}`, sources: [{ path: n.sample, volume: 0 }], pitch: n.key })),
      lib.play.notes,
    );
  }
  const tree = new Set(treeOf(lib, cache));
  const defaults: Record<number, number> = {};
  const regions = lib.sfz!.flatMap((program) => {
    const read = (p: string) => {
      fetchTo(raw(lib, p), local(p));
      return readFileSync(local(p), "utf8");
    };
    const parsed = parseSfz(program, read);
    Object.assign(defaults, parsed.cc);
    return parsed.regions;
  });
  // Some programs name samples as if they sat beside them; find the one file in the repo with that ending.
  for (const r of regions) {
    if (tree.has(r.sample)) continue;
    const tail = r.sample.split("/").slice(-2).join("/");
    const matches = [...tree].filter((p) => p.endsWith(`/${tail}`));
    if (matches.length === 1) r.sample = matches[0]!;
  }
  if (lib.play.kind === "drums") {
    return (Object.entries(lib.play.keys) as [Drum, number][]).flatMap(([drum, key]) => {
      const layers = sounding(regions, key, lib.velocity, lib, defaults);
      if (!layers.length) {
        console.warn(`  ${lib.id}: nothing sounds at key ${key} (${drum})`);
        return [];
      }
      return [{ name: drum, drum, pitch: key, sources: layers.map((r) => ({ path: r.sample, volume: r.volume })) }];
    });
  }
  const [lo, hi] = lib.play.notes;
  const out = new Map<string, Planned>();
  for (let key = lo; key <= hi; key += 3) {
    // Look the note up where the SFZ maps it, an octave off if its samples are.
    const layers = sounding(regions, key - 12 * (lib.octave ?? 0), lib.velocity, lib, defaults);
    if (!layers.length) continue;
    // The note's own layer is the one mapped to the fewest keys; a breath or noise layer spans many.
    const own = [...layers].sort((a, b) => a.hikey - a.lokey - (b.hikey - b.lokey))[0]!;
    const pitch = own.center - own.shift + 12 * (lib.octave ?? 0);
    const name = layers.map((r) => r.sample).join("|");
    if (!out.has(name)) out.set(name, { name: `${lib.id}-${out.size}`, pitch, sources: layers.map((r) => ({ path: r.sample, volume: r.volume })) });
  }
  return withRanges([...out.values()], lib.play.notes);
}

/** Each sample covers the keys nearer its pitch than its neighbours', and the first and last reach the range ends. */
function withRanges(samples: Planned[], [lo, hi]: Range): Planned[] {
  const sorted = [...samples].sort((a, b) => a.pitch - b.pitch);
  return sorted.map((s, i) => {
    const below = sorted[i - 1];
    const above = sorted[i + 1];
    const from = below ? Math.floor((below.pitch + s.pitch) / 2) + 1 : Math.min(lo, Math.round(s.pitch)) - 6;
    const to = above ? Math.floor((s.pitch + above.pitch) / 2) : Math.max(hi, Math.round(s.pitch)) + 6;
    return { ...s, keyRange: [from, to] as Range };
  });
}

function encode(lib: Library, planned: Planned[], cache: string, out: string): void {
  const dir = join(cache, "src", lib.id);
  for (const p of planned) for (const s of p.sources) fetchTo(raw(lib, s.path), join(dir, s.path));
  const seconds = lib.play.seconds;
  const fade = Math.min(0.3, seconds / 4);
  // One gain for the whole instrument, so its notes keep their balance: the loudest peaks at -1 dB.
  const peaks = planned.map((p) => peakDb(p.sources.map((s) => ({ file: join(dir, s.path), volume: s.volume })), seconds));
  const gain = -1 - Math.max(...peaks);
  for (const p of planned) {
    const inputs = p.sources.flatMap((s) => ["-i", join(dir, s.path)]);
    const mix = p.sources.map((s, i) => `[${i}:a]volume=${s.volume}dB[a${i}]`).join(";");
    const sum = p.sources.length > 1 ? `${p.sources.map((_, i) => `[a${i}]`).join("")}amix=inputs=${p.sources.length}:normalize=0[m]` : "[a0]anull[m]";
    const filter = `${mix};${sum};[m]aformat=channel_layouts=mono,atrim=0:${seconds},afade=t=out:st=${seconds - fade}:d=${fade},volume=${gain.toFixed(2)}dB[o]`;
    execFileSync("ffmpeg", ["-v", "error", "-y", ...inputs, "-filter_complex", filter, "-map", "[o]", "-c:a", "aac", "-b:a", "80k", join(out, `${p.name}.m4a`)]);
  }
}

function preset(lib: Library, planned: Planned[]) {
  const drums = lib.play.kind === "drums";
  return {
    meta: { name: lib.description, license: lib.license, source: `https://github.com/${lib.repo}/tree/${lib.commit}` },
    samples: { baseUrl: "./", formats: ["m4a"] },
    defaults: drums ? { ampRelease: 0.05 } : { ampRelease: 0.3 },
    groups: [
      {
        regions: planned.map((p) =>
          drums
            ? { sample: p.name, key: p.pitch, keyRange: [p.pitch, p.pitch] }
            : { sample: p.name, pitch: p.pitch, keyRange: p.keyRange },
        ),
      },
    ],
    ...(drums && { aliases: Object.fromEntries(planned.map((p) => [p.drum!, p.pitch])) }),
  };
}

if (import.meta.main) {
  const [cache, ...only] = process.argv.slice(2);
  if (!cache) {
    console.error("usage: node scripts/build-samples.ts <cache-dir> [instrument-id ...]");
    process.exit(1);
  }
  for (const lib of LIBRARIES.filter((l) => !only.length || only.includes(l.id))) {
    const planned = plan(lib, cache);
    if (!planned.length) {
      console.warn(`${lib.id}: no samples found; skipped`);
      continue;
    }
    const out = new URL(`../public/samples/${lib.id}/`, import.meta.url).pathname;
    rmSync(out, { recursive: true, force: true });
    mkdirSync(out, { recursive: true });
    encode(lib, planned, cache, out);
    writeFileSync(join(out, "preset.json"), JSON.stringify(preset(lib, planned), null, 1) + "\n");
    const size = Number(execFileSync("du", ["-sk", out], { encoding: "utf8" }).split("\t")[0]);
    console.log(`${lib.id}: ${planned.length} samples, ${size} KB${lib.play.kind === "pitched" ? `, pitches ${planned.map((p) => p.pitch.toFixed(1)).join(" ")}` : ""}`);
  }
}
