import type { FormType, Section } from "./types.ts";

export function classify(sections: Section[]): FormType {
  const roles = new Set(sections.map((s) => s.role));
  if (roles.has("chorus")) return roles.has("prechorus") ? "verse-prechorus-chorus" : "verse-chorus";
  const verses = sections.filter((s) => s.role === "verse");
  if (verses.length === 0) return "unknown";
  // No chorus, but verses contrasted by a bridge: letters A A B A in SALAMI terms.
  if (roles.has("bridge")) return "aaba";
  if (verses.every((v) => v.bars === 12)) return "12-bar-blues";
  return "strophic";
}

export const FORM_NAME: Record<FormType, string> = {
  "verse-chorus": "Verse–chorus",
  "verse-prechorus-chorus": "Verse–pre-chorus–chorus",
  aaba: "AABA (32-bar song form)",
  strophic: "Strophic (verses only)",
  "12-bar-blues": "12-bar blues",
  unknown: "Unknown",
};

export function isVerseChorus(t: FormType): boolean {
  return t === "verse-chorus" || t === "verse-prechorus-chorus";
}
