/**
 * Document serialisation, validation, and deserialisation for compose-balance.
 *
 * Supports two document formats in URLs:
 * 1. Version 1 structured JSON document (`#d=...`): captures complete section objects,
 *    including chords, intentional irregular-length markers, tempo, meter, and era.
 * 2. Legacy notation format (`#f=...`): shorthand SALAMI/Billboard text string.
 *
 * Enforces strict bounds against untrusted inputs:
 * - `MAX_DOCUMENT_CHARS`: 500,000 characters maximum hash size.
 * - `MAX_SECTIONS`: 256 sections maximum.
 * - `MAX_TOTAL_BARS`: 4,096 bars maximum across all sections.
 */
import { DEFAULT_ERA, ERA_NAME } from "./corpus.ts";
import { FOUR_FOUR, formatMeter, parseMeter } from "./meter.ts";
import { format, parse, SALAMI_LABEL } from "./parse.ts";
import type { Era, Options, Section } from "./types.ts";

/** Shared links are untrusted documents, not just display strings. */
export const MAX_DOCUMENT_CHARS = 500_000;
export const MAX_SECTIONS = 256;
export const MAX_TOTAL_BARS = 4096;
export const clampBpm = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) && number !== 0 ? Math.min(400, Math.max(20, number)) : 100;
};

export interface SharedDocument {
  sections: Section[];
  opts: Options;
  /** Only older links need a corpus lookup; new links contain their actual chords. */
  song?: string;
}

export function validSections(value: unknown): value is Section[] {
  if (!Array.isArray(value) || value.length > MAX_SECTIONS) return false;
  let total = 0;
  return value.every((section) => {
    if (!section || typeof section !== "object" || typeof section.role !== "string" || !Object.hasOwn(SALAMI_LABEL, section.role)) return false;
    if (!Number.isInteger(section.bars) || section.bars < 1 || section.bars > 64 || typeof section.intentional !== "boolean") return false;
    total += section.bars;
    if (total > MAX_TOTAL_BARS) return false;
    return section.chords === undefined || (Array.isArray(section.chords) && section.chords.length <= 64 &&
      section.chords.every((bar: unknown) => typeof bar === "string" && bar.length <= 2048 && bar.trim().split(/\s+/).length <= 64));
  });
}

export function readDocument(hash: string): SharedDocument | null {
  if (hash.length > MAX_DOCUMENT_CHARS) throw new Error("This shared document is too large.");
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const notation = params.get("f");
  if (notation === null && !params.has("d")) return null;
  let sections: Section[];
  if (params.has("d")) {
    let document: unknown;
    try { document = JSON.parse(params.get("d")!); } catch { throw new Error("This shared document is not valid JSON."); }
    if (!document || typeof document !== "object" || !("v" in document) || document.v !== 1 ||
      !("sections" in document) || !validSections(document.sections)) throw new Error("This shared document has invalid sections or an unsupported version.");
    sections = document.sections;
  } else {
    const result = parse(notation ?? "");
    sections = result.sections;
    if (!validSections(sections)) throw new Error("This shared form exceeds the supported document limits.");
  }
  const meter = parseMeter(params.get("m") ?? "4/4");
  const era = params.get("era");
  return {
    sections,
    opts: { bpm: clampBpm(params.get("bpm")), meter: typeof meter === "string" ? FOUR_FOUR : meter,
      era: era && Object.hasOwn(ERA_NAME, era) ? era as Era : DEFAULT_ERA },
    song: !params.has("d") && /^(bb|hx)\d{4}$/.test(params.get("song") ?? "") ? params.get("song")! : undefined,
  };
}

export function writeDocument(sections: Section[], opts: Options): string {
  if (!validSections(sections)) throw new Error("This form exceeds the supported document limits.");
  const params = new URLSearchParams({ f: format(sections), bpm: String(opts.bpm), m: formatMeter(opts.meter) });
  if (opts.era && opts.era !== DEFAULT_ERA) params.set("era", opts.era);
  if (sections.some((section) => section.chords !== undefined)) params.set("d", JSON.stringify({ v: 1, sections }));
  const hash = `#${params}`;
  if (hash.length > MAX_DOCUMENT_CHARS) throw new Error("This form is too large to save in a shared link. Download its annotation instead.");
  return hash;
}
