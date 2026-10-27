import type { Role } from "../core/types.ts";

/** Triads in C major (MIDI note numbers). */
export const CHORDS: Record<string, number[]> = {
  C: [60, 64, 67],
  Dm: [62, 65, 69],
  Em: [64, 67, 71],
  F: [65, 69, 72],
  G: [67, 71, 74],
  Am: [69, 72, 76],
};

/**
 * A 4-chord loop per role, one chord per bar. Because each loop is 4 bars long,
 * an irregular section audibly cuts the loop short or repeats its start.
 */
export const LOOPS: Record<Role, string[]> = {
  intro: ["C", "F", "C", "G"],
  verse: ["Am", "F", "C", "G"],
  prechorus: ["Dm", "Em", "F", "G"],
  chorus: ["C", "G", "Am", "F"],
  postchorus: ["F", "G", "C", "C"],
  bridge: ["F", "G", "Em", "Am"],
  solo: ["Am", "F", "C", "G"],
  instrumental: ["Am", "F", "C", "G"],
  interlude: ["C", "F", "C", "G"],
  transition: ["F", "G", "F", "G"],
  outro: ["C", "F", "C", "C"],
  coda: ["F", "C", "F", "C"],
};
