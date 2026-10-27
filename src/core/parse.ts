import type { Role, Section } from "./types.ts";

/**
 * Shorthand codes plus the SALAMI function labels and their documented synonyms.
 * Codes are short words (Vs, Ch, Br), never single capitals, so a form can't be
 * misread as chords (C, B) or Roman numerals (I, V). The old single-letter codes
 * are still accepted so earlier links keep working, but are never shown.
 */
const ALIASES: Record<string, Role> = {
  IN: "intro",
  VS: "verse",
  VRS: "verse",
  CHOR: "chorus",
  ITL: "interlude",
  INTER: "interlude",
  I: "intro",
  INTRO: "intro",
  INTRODUCTION: "intro",
  V: "verse",
  VERSE: "verse",
  P: "prechorus",
  PC: "prechorus",
  PRE: "prechorus",
  "PRE-CHORUS": "prechorus",
  PRECHORUS: "prechorus",
  C: "chorus",
  CH: "chorus",
  CHORUS: "chorus",
  REFRAIN: "chorus",
  B: "bridge",
  BR: "bridge",
  BRIDGE: "bridge",
  S: "solo",
  SOLO: "solo",
  INS: "instrumental",
  INST: "instrumental",
  INSTRUMENTAL: "instrumental",
  T: "interlude",
  INT: "interlude",
  INTERLUDE: "interlude",
  TR: "transition",
  TRANS: "transition",
  TRANSITION: "transition",
  // SALAMI groups pre-verse with the transition functions.
  "PRE-VERSE": "transition",
  O: "outro",
  OUT: "outro",
  OUTRO: "outro",
  CO: "coda",
  CODA: "coda",
};

export const CODE: Record<Role, string> = {
  intro: "In",
  verse: "Vs",
  prechorus: "Pre",
  chorus: "Ch",
  bridge: "Br",
  solo: "Solo",
  instrumental: "Inst",
  interlude: "Inter",
  transition: "Tr",
  outro: "Out",
  coda: "Coda",
};

export const NAME: Record<Role, string> = {
  intro: "Intro",
  verse: "Verse",
  prechorus: "Pre-chorus",
  chorus: "Chorus",
  bridge: "Bridge",
  solo: "Solo",
  instrumental: "Instrumental",
  interlude: "Interlude",
  transition: "Transition",
  outro: "Outro",
  coda: "Coda",
};

/** SALAMI function label for each role, as written in annotation files. */
export const SALAMI_LABEL: Record<Role, string> = {
  intro: "intro",
  verse: "verse",
  prechorus: "pre-chorus",
  chorus: "chorus",
  bridge: "bridge",
  solo: "solo",
  instrumental: "instrumental",
  interlude: "interlude",
  transition: "transition",
  outro: "outro",
  coda: "coda",
};

/** Used when notation omits a bar count, e.g. "V V C". */
export const DEFAULT_BARS: Record<Role, number> = {
  intro: 4,
  verse: 8,
  prechorus: 4,
  chorus: 8,
  bridge: 8,
  solo: 8,
  instrumental: 8,
  interlude: 4,
  transition: 4,
  outro: 4,
  coda: 4,
};

/** Looks up a code or label ("PC", "pre-chorus", "Pre Chorus"). */
export function roleFor(label: string): Role | undefined {
  return ALIASES[label.trim().toUpperCase().replace(/[\s_]+/g, "-")] ?? ALIASES[label.trim().toUpperCase().replace(/[\s_-]+/g, "")];
}

export interface ParseResult {
  sections: Section[];
  errors: string[];
}

/** Parses notation like "In4 Vs8 Pre4 Ch7! Br8 Out4". Separators: whitespace, commas, dashes. */
export function parse(text: string): ParseResult {
  const sections: Section[] = [];
  const errors: string[] = [];
  // "pre chorus" and "pre-chorus" are one token; " - " between tokens is a separator.
  const tokens = text
    .replace(/\b(pre)[\s-]+(chorus|verse)\b/gi, "$1-$2")
    .split(/[\s,]+|\s+-\s+/)
    .filter((t) => t && t !== "-");
  for (const token of tokens) {
    const m = /^([A-Za-z][A-Za-z-]*?)(\d+)?(!)?$/.exec(token);
    const role = m ? roleFor(m[1]!) : undefined;
    if (!m || !role) {
      const hint = /^[ADEFGH]'*\d*$/.test(token)
        ? " Letters like A and B describe repeated material, not a section's job. Write AABA as Vs8 Vs8 Br8 Vs8."
        : ` Use a code (${Object.values(CODE).join(", ")}) or a full name like pre-chorus, then an optional bar count.`;
      errors.push(`"${token}" is not a section.${hint}`);
      continue;
    }
    const bars = m[2] ? Number(m[2]) : DEFAULT_BARS[role];
    if (bars < 1 || bars > 64) {
      errors.push(`"${token}": bar count must be 1 to 64.`);
      continue;
    }
    sections.push({ role, bars, intentional: Boolean(m[3]) });
  }
  return { sections, errors };
}

export function format(sections: Section[]): string {
  return sections.map(formatSection).join(" ");
}

export function formatSection(s: Section): string {
  return `${CODE[s.role]}${s.bars}${s.intentional ? "!" : ""}`;
}
