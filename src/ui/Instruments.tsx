import { type BandChoice, INSTRUMENTS, type Part, PART_NAME } from "../audio/instruments.ts";

interface Props {
  band: BandChoice;
  onChange(band: BandChoice): void;
  onClose(): void;
}

const PARTS: Part[] = ["keys", "bass", "drums", "pad"];

const HINT: Record<Part, string> = {
  keys: "plays the chords",
  bass: "plays each chord's root",
  drums: "plays a groove that builds from intro to chorus",
  pad: "holds the chords in pre-choruses, choruses and bridges",
};

/** Which instrument plays each part of the Band sound. */
export function Instruments({ band, onChange, onClose }: Props) {
  return (
    <section className="panel" aria-labelledby="instruments-title">
      <div className="panel-head">
        <h2 id="instruments-title">Instruments</h2>
        <button onClick={onClose}>Close</button>
      </div>
      <div className="instrument-parts">
        {PARTS.map((part) => (
          <label key={part} className="instrument-part">
            <span className="instrument-part-name">{PART_NAME[part]}</span>
            <select
              value={band[part] ?? ""}
              onChange={(e) => onChange({ ...band, [part]: e.target.value || null })}
            >
              {part === "pad" && <option value="">None</option>}
              {INSTRUMENTS.filter((i) => i.part === part).map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
            <span className="hint">{HINT[part]}</span>
          </label>
        ))}
      </div>
      <p className="hint">
        Each instrument loads the first time it plays, which can take a few seconds. All samples are public domain or
        CC0: Versilian Studios, Karoryfer Samples, D. Smolken and Akai via smplr and sfzinstruments.
      </p>
    </section>
  );
}
