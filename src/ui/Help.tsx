import { useState } from "react";
import { CODE, NAME } from "../core/parse.ts";
import type { Role } from "../core/types.ts";
import { Mark } from "./marks.tsx";
import { isWide } from "./wide.ts";

const ROLES = Object.keys(CODE) as Role[];

export function Help({ onClose }: { onClose(): void }) {
  // The keyboard's list starts open where there is likely a keyboard, folded on a phone.
  const [wide] = useState(isWide);
  return (
    <section className="panel" aria-labelledby="help-title">
      <div className="panel-head">
        <h2 id="help-title">How this works</h2>
        <button onClick={onClose}>Close</button>
      </div>
      <div className="help-columns">
        <div>
          <h3>The shape table</h3>
          <ul>
            <li>
              Every bar is a shape made of the lattice's triangles, one per section type: a bridge bar is one triangle, a verse
              two, a pre-chorus three, a chorus the whole hexagon, an intro a big triangle and an outro a long rhombus. Each type has its own
              colour; the rarer types share white, and a solo is a solid chorus colour.
            </li>
            <li>
              Tap a shape in the tray to add a 4-bar section of it at the end, or drag it onto the sky: dropped against a
              section of its own type, it adds a bar to it; anywhere else it starts a section.
            </li>
            <li>
              Tap a section (or its label) to pick it. The tray shows its actions: − and + make it a bar shorter or longer,
              then Turn, Play and Remove; ⋯ shows Glue to neighbours, Break apart and Pull a bar off. Done, or a swipe
              down, brings the shapes back.
            </li>
            <li>Drag a section to move it: near a slot it leans in and clicks into place. A change that would leave part of a bar is undone.</li>
            <li>
              Sections of one colour side by side stay separate until you glue them, so two verses in a row can sit
              together. Glued sections of different colours move and turn together.
            </li>
            <li>The song reads the table like a page: rows top to bottom, left to right. Numbers on the labels and a dotted thread show the order. Tidy up lays it all out neatly again, in that order; Undo puts your arrangement back.</li>
            <li>A hand-off drawn solid red or ochre is where a note applies; tap it, or its pin, to open the note. During playback the thread fills in and a dot steps from bar to bar.</li>
            <li>Pick a short section and a dashed outline shows where its phrase would finish, with the bars it adds; tap it to fill it. A flagged section shows it all the time. Shears take a bar off every section a stroke goes clean through.</li>
            <li>To type the form instead, open Tools and turn on Text. To start from a real song, pick Load a real hit in the ⋯ menu.</li>
          </ul>
          <h3>The chart</h3>
          <ul>
            <li>Switch to it with Chart, beside Play. Build the form with the buttons under it; on a phone, ⋯ on a section shows its actions.</li>
            <li>Four bars to a line. A short line means the section stops partway through a phrase.</li>
            <li>Tap an empty slot at the end of a line to add bars up to it.</li>
            <li>Tap any bar to play from there. Band plays chords, bass and drums, busier in choruses, with a fill into each new section; pick the instruments, and an optional pad, in ⋯ → Instruments. Each instrument takes a few seconds to load the first time. Click plays plain chords with a click on every beat.</li>
            <li>Drag a section by its shape to move it.</li>
            <li>
              Shears: turn them on, then drag across a section to cut it at the nearest barline, or across its shape
              to remove it. The − button and the shears button on each section (or Remove, under ⋯ on a phone) do the same without a drag.
            </li>
            <li>
              Pick a time signature or type any, like <kbd>5/4</kbd>, <kbd>7/8</kbd> or <kbd>2+2+3/8</kbd> to set how
              the beats group. The note before the tempo shows what it counts: quarters in 4/4, eighths in 7/8, dotted
              quarters in 6/8 and 12/8.
            </li>
            <li>The length next to Play follows the tempo and time signature. On a phone, − and + beside the tempo step it (hold to keep going), and Tap sets it from your taps.</li>
            <li>The chords are placeholders so you can hear the form, not your song’s harmony. A classic hit loaded from the ⋯ menu plays its real chords instead, and they move with their sections.</li>
          </ul>
          <details className="help-keys" open={wide}>
            <summary>Keyboard shortcuts</summary>
            <ul>
              <li>Space plays and stops. Cmd/Ctrl+Z undoes. Escape lets go of a picked section or closes a panel.</li>
              <li>Tab to a section's label: Space shows its actions, + and − change its length, Delete removes it, Enter plays from it.</li>
              <li>
                Tab to a piece: the arrow keys step it, R (or a double-click) turns it, G glues it to everything it touches,
                Shift+G breaks it apart and Delete throws it away.
              </li>
              <li>Alt-drag (Option-drag on a Mac) a bar to pull it off in its own shape.</li>
              <li>Tab to a shape in the tray and press Enter to add a 4-bar section of it.</li>
            </ul>
          </details>
        </div>
        <div>
          <h3>Typing a form</h3>
          <p>One code per section, followed by its length in bars. Leave the number off for the usual length.</p>
          <ul className="codes">
            {ROLES.map((r) => (
              <li key={r}>
                <Mark role={r} box={18} /> <kbd>{CODE[r]}</kbd> {NAME[r].toLowerCase()}
              </li>
            ))}
          </ul>
          <p>
            Full names work too (<kbd>pre-chorus4</kbd>). Add <kbd>!</kbd> when an odd length is on purpose:{" "}
            <kbd>Ch7!</kbd>.
          </p>
        </div>
        <div>
          <h3>About the checks</h3>
          <p>
            They come from phrase-rhythm theory, songwriting teaching and chart studies. Each note says how strong its
            evidence is, with sources one click away. Balance is partly a matter of style, so read warnings as
            questions.
          </p>
          <p>
            The limits are measured from real hits: about 900 modern pop songs (the Harmonix Set) or about 740 Hot 100
            songs from 1958–1991 (McGill Billboard), picked in the toolbar. Something most hits do gets a note, not a
            warning; a song only reads as unbalanced when its odd lengths add up to more than 9 in 10 of those hits have.
          </p>
        </div>
      </div>
    </section>
  );
}
