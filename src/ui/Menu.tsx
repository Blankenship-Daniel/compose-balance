import { useEffect, useRef, useState } from "react";
import { PRESETS } from "../core/presets.ts";

interface Props {
  onPreset(name: string): void;
  onOpen(panel: "exchange" | "help" | "songs" | "instruments"): void;
}

/** Things used once per session: examples, real hits, import/export, help. */
export function Menu({ onPreset, onOpen }: Props) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  const choose = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };

  return (
    <div className="menu" ref={root}>
      <button
        className="menu-button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label="More"
        title="Examples, real hits, instruments, import or export, help"
        onClick={() => setOpen((o) => !o)}
      >
        ⋯
      </button>
      {open && (
        <div className="menu-list">
          <p className="menu-heading">Start from an example</p>
          {PRESETS.map((p) => (
            <button key={p.name} onClick={choose(() => onPreset(p.name))}>
              {p.name}
            </button>
          ))}
          <button onClick={choose(() => onOpen("songs"))}>Load a real hit…</button>
          <hr />
          <button onClick={choose(() => onOpen("instruments"))}>Instruments…</button>
          <button onClick={choose(() => onOpen("exchange"))}>Import or export…</button>
          <button onClick={choose(() => onOpen("help"))}>How this works</button>
        </div>
      )}
    </div>
  );
}
