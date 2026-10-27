import { useEffect, useState } from "react";
import { corpusFor, ERA_NAME } from "../core/corpus.ts";
import { type Hit, loadHits, searchHits } from "../core/songs.ts";

interface Props {
  onLoad(hit: Hit): void;
  onClose(): void;
}

/** Find a hit from either corpus by title or artist and load its form. */
export function SongSearch({ onLoad, onClose }: Props) {
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  useEffect(() => {
    let live = true;
    loadHits().then(
      (all) => live && setHits(all),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, []);

  const results = hits ? searchHits(hits, query) : [];
  const picked = results[Math.min(active, results.length - 1)];

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((i) => (Math.min(i, results.length - 1) + step + results.length) % Math.max(1, results.length));
    } else if (e.key === "Enter" && picked) {
      e.preventDefault();
      onLoad(picked);
    }
  }

  return (
    <section className="panel" aria-labelledby="songs-title">
      <div className="panel-head">
        <h2 id="songs-title">Load a real hit</h2>
        <button onClick={onClose}>Close</button>
      </div>
      <input
        className="song-query"
        type="search"
        autoFocus
        value={query}
        placeholder="Title or artist"
        aria-label="Search hits by title or artist"
        role="combobox"
        aria-expanded={results.length > 0}
        aria-controls="song-results"
        aria-activedescendant={picked ? `song-${hits!.indexOf(picked)}` : undefined}
        spellCheck={false}
        autoComplete="off"
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
        }}
        onKeyDown={onKey}
      />
      {failed ? (
        <p className="import-notes">The song list didn’t load. Check the connection and open this again.</p>
      ) : !hits ? (
        <p className="hint">Loading the song list…</p>
      ) : query.trim() && results.length === 0 ? (
        <p className="hint">No hit matches that. These are {hits.length.toLocaleString()} songs from two research sets, so many songs aren’t here.</p>
      ) : (
        <ul className="song-results" id="song-results" role="listbox" aria-label="Matching hits">
          {results.map((hit) => (
            <li
              key={hits.indexOf(hit)}
              id={`song-${hits.indexOf(hit)}`}
              role="option"
              aria-selected={hit === picked}
              onPointerEnter={() => setActive(results.indexOf(hit))}
              onClick={() => onLoad(hit)}
            >
              <span className="song-title">{hit.title}</span> <span className="song-artist">{hit.artist}</span>
              <span className="song-meta">
                {hit.year ?? "year unknown"} · {ERA_NAME[hit.era].replace(/ \(.*\)$/, "")}
                {hit.chords && " · chords"}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="hint song-sources">
        Forms as the researchers annotated them, so a song you know may be split or named differently. Each song loads
        with its own tempo, time signature and era; classic hits also play their real chords. Sources: {corpusFor("classic").source}; {corpusFor("modern").source}.
      </p>
    </section>
  );
}
