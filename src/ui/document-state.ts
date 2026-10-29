import { useEffect, useRef, useState, type RefObject } from "react";
import { clampBpm, readDocument, writeDocument, type SharedDocument } from "../core/document.ts";
import { parse } from "../core/parse.ts";
import { PRESETS } from "../core/presets.ts";
import { DEFAULT_ERA } from "../core/corpus.ts";
import { FOUR_FOUR } from "../core/meter.ts";
import { restoreChords } from "../core/songs.ts";
import type { Options, Section } from "../core/types.ts";

export { clampBpm };
export function readPref(key: string): string | null {
  try { return localStorage.getItem(`compose-balance:${key}`); } catch { return null; }
}
export function writePref(key: string, value: string) {
  try { localStorage.setItem(`compose-balance:${key}`, value); } catch { /* Private/storage-blocked browsers still work. */ }
}

export function initialDocument(): SharedDocument & { error?: string } {
  const preset = PRESETS[0]!;
  const fallback = { sections: parse(preset.notation).sections,
    opts: { bpm: preset.bpm, meter: FOUR_FOUR, era: DEFAULT_ERA } };
  try { return readDocument(location.hash) ?? fallback; }
  catch (error) { return { ...fallback, error: (error as Error).message }; }
}

/** Hash changes replace documents. Async legacy lookups cannot overwrite subsequent edits. */
export function useDocumentLink(sections: Section[], opts: Options, initial: SharedDocument,
  onLoad: (document: SharedDocument) => void, editRevision: RefObject<number>) {
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const callback = useRef(onLoad);
  callback.current = onLoad;
  const live = useRef({ sections, opts });
  live.current = { sections, opts };
  const generation = useRef(0);
  const loadingHash = useRef<string | null>(null);
  const legacyPending = useRef(Boolean(initial.song));
  useEffect(() => {
    let active = true;
    const load = async (document: SharedDocument) => {
      const version = ++generation.current;
      callback.current(document);
      const expected = editRevision.current;
      if (document.song) {
        try {
          const restored = await restoreChords(document.song, document.sections);
          if (active && version === generation.current && editRevision.current === expected && restored)
            callback.current({ sections: restored, opts: live.current.opts });
        } catch {
          if (active && version === generation.current) setError("The linked song's chords could not load. Placeholder chords are being used.");
        }
      }
      if (active && version === generation.current) {
        legacyPending.current = false;
        loadingHash.current = null;
        setRevision((value) => value + 1);
      }
    };
    const changed = () => {
      generation.current++;
      legacyPending.current = false;
      loadingHash.current = location.hash;
      try {
        const document = readDocument(location.hash);
        if (!document) throw new Error("This link does not contain a form.");
        setError(null);
        legacyPending.current = Boolean(document.song);
        void load(document);
      } catch (cause) { loadingHash.current = null; setError((cause as Error).message); }
    };
    window.addEventListener("hashchange", changed);
    if (initial.song) void load(initial);
    return () => { active = false; generation.current++; window.removeEventListener("hashchange", changed); };
  }, []);
  useEffect(() => {
    if (legacyPending.current || loadingHash.current !== null) return;
    try { window.history.replaceState(null, "", writeDocument(sections, opts)); }
    catch (cause) { setError((cause as Error).message); }
  }, [sections, opts.bpm, opts.meter, opts.era, revision]);
  return error;
}
