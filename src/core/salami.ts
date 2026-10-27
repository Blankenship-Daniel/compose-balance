/**
 * Reads and writes the SALAMI / McGill Billboard annotation format.
 *
 * Each line is "<seconds>\t<comma-separated labels>". Labels are an uppercase
 * letter for repeated material (A, B, B'), a SALAMI function label (verse,
 * chorus...), and in Billboard files the bars themselves: "| A:min | C:maj |".
 * Billboard files open with "# title:", "# artist:", "# metre:" and "# tonic:".
 * See docs/research.md for sources.
 */
import { LOOPS } from "../audio/chords.ts";
import { DEFAULT_BARS, SALAMI_LABEL } from "./parse.ts";
import { type Meter, parseMeter } from "./meter.ts";
import { secondsFor } from "./stats.ts";
import type { Options, Role, Section } from "./types.ts";

/** Billboard/Harte spelling of the chord symbols the player uses. */
const HARTE: Record<string, string> = {
  C: "C:maj",
  Dm: "D:min",
  Em: "E:min",
  F: "F:maj",
  G: "G:maj",
  Am: "A:min",
};

/** SALAMI function labels, their documented synonyms, and near-synonyms mapped onto this app's functions. */
const FUNCTIONS: Record<string, Role> = {
  ...Object.fromEntries(Object.entries(SALAMI_LABEL).map(([role, label]) => [label, role as Role])),
  introduction: "intro",
  refrain: "chorus",
  trans: "transition",
  "pre-verse": "transition",
  prechorus: "prechorus",
  head: "verse",
  "main theme": "verse",
  main_theme: "verse",
  theme: "bridge",
  "secondary theme": "bridge",
  secondary_theme: "bridge",
  contrasting_middle: "bridge",
  break: "interlude",
  build: "transition",
  "post-chorus": "interlude",
  "post-verse": "interlude",
  "pick-up": "intro",
  tag: "outro",
  development: "bridge",
  exposition: "verse",
  recapitulation: "verse",
  recap: "verse",
  ritornello: "outro",
};

/** Labels that frame or decorate a section without changing its function. */
const IGNORED = new Set(["fadeout", "fade-out", "no_function", "count-in", "spoken", "applause", "voice", "groove"]);

/**
 * SALAMI uppercase letters: sections with the same function share a letter, in
 * order of first appearance. This assumes repeated functions reuse material,
 * which is true of most sketches but not every song.
 */
export function letters(sections: Section[]): string[] {
  const seen = new Map<Role, string>();
  return sections.map((s) => {
    if (!seen.has(s.role)) seen.set(s.role, String.fromCharCode(65 + Math.min(seen.size, 24)));
    return seen.get(s.role)!;
  });
}

function seconds(n: number): string {
  return Number(n.toFixed(6)).toString();
}

/** Writes a McGill Billboard-style annotation: one line per 4-bar phrase. */
export function toBillboard(sections: Section[], opts: Options, title = "Untitled sketch"): string {
  const out = [`# title: ${title}`, `# artist: compose-balance`, `# metre: ${opts.meter.beats}/${opts.meter.unit}`, `# tonic: C`, ""];
  const labels = letters(sections);
  let bar = 0;
  sections.forEach((s, i) => {
    for (let b = 0; b < s.bars; b += 4) {
      const chords = Array.from({ length: Math.min(4, s.bars - b) }, (_, k) => HARTE[LOOPS[s.role][(b + k) % 4]!]!);
      const cells = `| ${chords.join(" | ")} |`;
      const head = b === 0 ? `${labels[i]}, ${SALAMI_LABEL[s.role]}, ` : "";
      out.push(`${seconds(secondsFor(bar + b, opts))}\t${head}${cells}`);
    }
    bar += s.bars;
  });
  out.push(`${seconds(secondsFor(bar, opts))}\tend`);
  return out.join("\n") + "\n";
}

export interface ImportResult {
  sections: Section[];
  meter?: Meter;
  title?: string;
  /** Problems a person should know about; the import still succeeds. */
  notes: string[];
}

interface Pending {
  role: Role | null;
  bars: number;
  start: number;
  end?: number;
}

/**
 * Reads a SALAMI textfile or McGill Billboard salami_chords file. Bars come from
 * barlines when present; otherwise they are estimated from timestamps at `opts.bpm`.
 */
export function fromAnnotation(text: string, opts: Options): ImportResult {
  const notes: string[] = [];
  let meter: Meter | undefined;
  let title: string | undefined;
  const pending: Pending[] = [];
  let current: Pending | null = null;
  const unknown = new Set<string>();

  const close = (at: number) => {
    if (current) current.end = at;
    current = null;
  };

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("#")) {
      const m = /^#\s*(\w+)\s*:\s*(.*)$/.exec(line);
      if (m?.[1] === "metre") {
        const parsed = parseMeter(m[2]!);
        if (typeof parsed !== "string") meter = parsed;
      } else if (m?.[1] === "title") title = m[2]!.trim();
      continue;
    }
    const m = /^(-?[\d.eE+-]+)\s+(.*)$/.exec(line);
    if (!m) {
      notes.push(`Skipped a line without a timestamp: "${line.slice(0, 40)}"`);
      continue;
    }
    const time = Number(m[1]);
    let barsOnLine = 0;
    let role: Role | null | undefined; // undefined = no new section on this line
    let boundary = false;

    for (const item of m[2]!.split(",").map((x) => x.trim()).filter(Boolean)) {
      const lower = item.toLowerCase().replace(/[()]/g, "").trim();
      if (item.startsWith("|")) {
        barsOnLine += Math.max(0, (item.match(/\|/g)?.length ?? 1) - 1);
      } else if (lower === "silence" || lower === "end" || /^z'*$/.test(item)) {
        close(time);
        role = undefined;
        boundary = false;
      } else if (/^[A-Y]'*$/.test(item)) {
        boundary = true; // a new uppercase letter starts a new section
      } else if (/^[a-z]{1,2}'*$/.test(item)) {
        // lowercase phrase letters: finer than this app's sections
      } else if (item.startsWith("(") || item.endsWith(")") || IGNORED.has(lower)) {
        // instrument tags and decorative labels
      } else {
        const r = FUNCTIONS[lower.replace(/_/g, " ")] ?? FUNCTIONS[lower];
        if (r) {
          role = r;
          boundary = true;
        } else unknown.add(lower);
      }
    }

    if (boundary) {
      close(time);
      current = { role: role ?? null, bars: 0, start: time };
      pending.push(current);
    }
    if (current) (current as Pending).bars += barsOnLine;
  }

  if (unknown.size) notes.push(`Ignored labels this app doesn't model: ${[...unknown].join(", ")}.`);

  const barDur = secondsFor(1, { ...opts, meter: meter ?? opts.meter });
  let estimated = 0;
  let untyped = 0;
  const sections: Section[] = [];
  pending.forEach((p, i) => {
    let bars = p.bars;
    if (bars === 0) {
      const end = p.end ?? pending[i + 1]?.start;
      bars = end !== undefined ? Math.max(1, Math.round((end - p.start) / barDur)) : DEFAULT_BARS[p.role ?? "interlude"];
      estimated++;
    }
    let role = p.role;
    if (!role) {
      // SALAMI: a function label lasts until the next uppercase letter, so a
      // letter on its own starts a section with no function. Treat it as an interlude.
      role = "interlude";
      untyped++;
    }
    // Consecutive lines of one section can repeat its function (e.g. "B, verse" twice for a long verse).
    sections.push({ role, bars: Math.min(64, bars), intentional: false });
  });

  if (estimated)
    notes.push(
      `${estimated} section${estimated === 1 ? "" : "s"} had no barlines, so bar counts were estimated from timestamps at ${opts.bpm} bpm. Set the tempo to the song's and import again for better counts.`,
    );
  if (untyped) notes.push(`${untyped} section${untyped === 1 ? "" : "s"} had a letter but no function label and became interludes.`);
  if (sections.length === 0) notes.push("No sections found. Expected lines like \"12.5\tA, verse, | C:maj | G:maj |\".");

  return { sections, meter, title, notes };
}
