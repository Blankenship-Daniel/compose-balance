import { type ReactNode, useEffect, useRef } from "react";

/**
 * A button that steps a value once when pressed and keeps stepping while it is held, faster than
 * typing a number on a phone's keyboard. A keyboard press steps once.
 */
export function StepButton({ label, onStep, children }: { label: string; onStep(): void; children: ReactNode }) {
  const timer = useRef<number | undefined>(undefined);
  const step = useRef(onStep);
  step.current = onStep;
  const stop = () => {
    clearTimeout(timer.current);
    clearInterval(timer.current);
    timer.current = undefined;
  };
  useEffect(() => stop, []);
  return (
    <button
      className="tempo-step"
      aria-label={label}
      title={`${label} (hold to keep going)`}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        step.current();
        stop();
        timer.current = window.setTimeout(() => {
          timer.current = window.setInterval(() => step.current(), 60);
        }, 400);
      }}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onClick={(e) => {
        if (e.detail === 0) step.current();
      }}
    >
      {children}
    </button>
  );
}

/** Tap along with the song: the tempo is the average of the last few taps, a new count after a pause. */
export function TapTempo({ onTempo }: { onTempo(bpm: number): void }) {
  const taps = useRef<number[]>([]);
  return (
    <button
      className="tap-tempo"
      title="Tap along with the beat to set the tempo"
      onClick={() => {
        const now = performance.now();
        const last = taps.current.at(-1);
        taps.current = last !== undefined && now - last < 2000 ? [...taps.current.slice(-4), now] : [now];
        const t = taps.current;
        if (t.length < 2) return;
        const beat = (t.at(-1)! - t[0]!) / (t.length - 1);
        onTempo(Math.round(60000 / beat));
      }}
    >
      Tap
    </button>
  );
}
