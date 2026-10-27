import { useState } from "react";
import { fromAnnotation, toBillboard } from "../core/salami.ts";
import type { Meter } from "../core/meter.ts";
import type { Options, Section } from "../core/types.ts";

interface Props {
  sections: Section[];
  opts: Options;
  onImport(sections: Section[], meter?: Meter): void;
  onClose(): void;
}

/** Import and export in the SALAMI / McGill Billboard annotation format. */
export function Exchange({ sections, opts, onImport, onClose }: Props) {
  // null = show the live export of the current form; a string = the person's pasted text.
  const [draft, setDraft] = useState<string | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  const exported = toBillboard(sections, opts);
  const text = draft ?? exported;

  function load(source: string) {
    const result = fromAnnotation(source, opts);
    setNotes(result.notes);
    if (result.sections.length) {
      onImport(result.sections, result.meter);
      setDraft(null);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(exported);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setNotes(["The browser blocked clipboard access. Select the text and copy it instead."]);
    }
  }

  function download() {
    const url = URL.createObjectURL(new Blob([exported], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "form.salami.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="panel" aria-labelledby="exchange-title">
      <div className="panel-head">
        <h2 id="exchange-title">Import or export</h2>
        <button onClick={onClose}>Close</button>
      </div>
      <p className="hint">
        Uses the SALAMI / McGill Billboard format from music research: one line per phrase with a time, a letter for
        repeated material, the section’s name, and the bars between <kbd>|</kbd> barlines. Paste a file from either
        dataset to check a real song.
      </p>
      <textarea
        className="annotation"
        value={text}
        spellCheck={false}
        rows={10}
        onChange={(e) => setDraft(e.target.value)}
        aria-label="Annotation text"
      />
      <div className="exchange-actions">
        <button onClick={() => load(text)} disabled={draft === null}>
          Import this text
        </button>
        <label className="file-button">
          Open file…
          <input
            type="file"
            accept=".txt,text/plain"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (file) load(await file.text());
              e.target.value = "";
            }}
          />
        </label>
        <span className="spacer" />
        {draft !== null && <button onClick={() => (setDraft(null), setNotes([]))}>Show current form</button>}
        <button onClick={copy}>{copied ? "Copied" : "Copy"}</button>
        <button onClick={download}>Download .txt</button>
      </div>
      {notes.length > 0 && (
        <ul className="import-notes">
          {notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
