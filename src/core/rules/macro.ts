import { isVerseChorus } from "../classify.ts";
import {
  bridgeStart,
  CORPUS_SOURCE,
  formatShare,
  MIN_SAMPLE,
  type Step,
  transitionCount,
  transitionShare,
  usualNext,
} from "../corpus.ts";
import { DEFAULT_BARS, NAME } from "../parse.ts";
import { pluralName } from "./phrase.ts";
import { insertAt, lastBodyIndex, move, setBars } from "../fixes.ts";
import { formatSeconds, secondsFor, startBar, totalBars, typicalBars } from "../stats.ts";
import type { Finding, FormType, Options, Role, Section } from "../types.ts";

const TIME_SOURCE =
  "Léveillé Gauvin, Musicae Scientiae 22(3) (2018); Hit Songs Deconstructed trend reports (first chorus ~30–45 s in recent hits); Montecchio, Roy & Pachet, PLOS ONE 15(9) (2020) (Spotify skips follow song structure)";
const FORM_SOURCE = "Summach, MTO 17.3 (2011); de Clercq, MTO 23.3 (2017); Open Music Theory, verse-chorus form";

function chorusOf(sections: Section[]): Section {
  return { role: "chorus", bars: typicalBars(sections, "chorus") ?? DEFAULT_BARS.chorus, intentional: false };
}

function verseOf(sections: Section[]): Section {
  return { role: "verse", bars: typicalBars(sections, "verse") ?? DEFAULT_BARS.verse, intentional: false };
}

/** R7: three or more verses before the first chorus delays the payoff. */
function firstChorusDelay(sections: Section[], type: FormType, opts: Options): Finding[] {
  if (!isVerseChorus(type)) return [];
  const first = sections.findIndex((s) => s.role === "chorus");
  const verseIdx = sections.slice(0, first).flatMap((s, i) => (s.role === "verse" ? [i] : []));
  if (verseIdx.length < 3) return [];
  const sec = secondsFor(startBar(sections, first), opts);
  const afterSecondVerse = verseIdx[1]! + 1;
  return [
    {
      rule: "R7",
      severity: "warning",
      basis: "convention",
      title: `${verseIdx.length} verses before the first chorus`,
      why: `The chorus is the payoff of a verse–chorus song, and it doesn't arrive until ${formatSeconds(sec)} at ${opts.bpm} bpm. Stacked verses make the opening feel like one long section. Strophic songs and AABA tunes stack verses happily, but they don't have a chorus waiting.`,
      source: FORM_SOURCE,
      sectionIndexes: verseIdx,
      // Every verse-to-verse hand-off, and the long-awaited one into the chorus.
      boundaries: verseIdx,
      fixes: [
        {
          label: "Insert a chorus after verse 2",
          sections: insertAt(sections, afterSecondVerse, chorusOf(sections)),
        },
      ],
    },
  ];
}

/** R8: how long the listener waits for the first chorus, and how long the intro is. */
function timeToChorus(sections: Section[], type: FormType, opts: Options): Finding[] {
  const findings: Finding[] = [];
  const introIdx = sections[0]?.role === "intro" ? 0 : -1;
  if (introIdx === 0) {
    const intro = sections[0]!;
    const sec = secondsFor(intro.bars, opts);
    if (intro.bars > 8 || sec > 20) {
      findings.push({
        rule: "R8",
        severity: "info",
        basis: "convention",
        title: `Long intro (${intro.bars} bars, ${formatSeconds(sec)})`,
        why: "Intros on hit records shrank from about 20 seconds in the mid-1980s to about 5 seconds by 2015. A long intro is a stylistic choice, but it delays everything that follows.",
        source: TIME_SOURCE,
        sectionIndexes: [0],
        fixes: [{ label: "Shorten the intro to 4 bars", sections: setBars(sections, [0], 4) }],
      });
    }
  }
  if (!isVerseChorus(type)) return findings;
  const first = sections.findIndex((s) => s.role === "chorus");
  const sec = secondsFor(startBar(sections, first), opts);
  if (sec > 45) {
    findings.push({
      rule: "R8",
      severity: sec > 60 ? "warning" : "info",
      basis: "convention",
      title: `First chorus arrives at ${formatSeconds(sec)}`,
      why: `Recent hit songs reach the chorus in about 30–45 seconds. At ${opts.bpm} bpm this one takes ${formatSeconds(sec)}. That is fine for slower or album-oriented songs; for a radio-style pop song, shorten what comes before it.`,
      source: TIME_SOURCE,
      sectionIndexes: [first],
      fixes: [],
    });
  }
  return findings;
}

/** A chorus that only appears once never gets to return. */
function chorusReturns(sections: Section[], type: FormType): Finding[] {
  if (!isVerseChorus(type)) return [];
  const idx = sections.flatMap((s, i) => (s.role === "chorus" ? [i] : []));
  if (idx.length !== 1) return [];
  return [
    {
      rule: "R9",
      severity: "warning",
      basis: "convention",
      title: "The chorus only appears once",
      why: "A chorus gets its weight from coming back. With one appearance, the song has no recurring anchor to balance the verses against.",
      source: FORM_SOURCE,
      sectionIndexes: idx,
      fixes: [
        {
          label: "Add a final chorus",
          sections: insertAt(sections, lastBodyIndex(sections) + 1, chorusOf(sections)),
        },
      ],
    },
  ];
}

/** R9: contrast (bridge / B section) works after the main material has repeated. */
function contrastAfterRepetition(sections: Section[], type: FormType): Finding[] {
  const findings: Finding[] = [];
  const bridge = sections.findIndex((s) => s.role === "bridge");
  if (bridge < 0) return findings;

  if (type === "aaba") {
    // In AABA the A sections carry the verse function (SALAMI letters A A B A).
    const asBefore = sections.slice(0, bridge).filter((s) => s.role === "verse").length;
    if (asBefore < 2) {
      findings.push({
        rule: "R9",
        severity: "warning",
        basis: "convention",
        title: `The B section arrives after ${asBefore} A section${asBefore === 1 ? "" : "s"}`,
        why: "In AABA form the A section is stated twice so the B section has something to contrast against.",
        source: "Open Music Theory, AABA form; Thirty-two-bar form",
        sectionIndexes: [bridge],
        boundaries: bridge > 0 ? [bridge - 1] : [],
        fixes: [
          {
            label: "Add an A before the B section",
            sections: insertAt(sections, bridge, verseOf(sections)),
          },
        ],
      });
    }
    if (!sections.slice(bridge + 1).some((s) => s.role === "verse")) {
      findings.push({
        rule: "R9",
        severity: "warning",
        basis: "convention",
        title: "No A section after the B section",
        why: "AABA resolves by returning to A after the contrast. Without the return the song ends on the contrast.",
        source: "Open Music Theory, AABA form",
        sectionIndexes: [bridge],
        boundaries: bridge < sections.length - 1 ? [bridge] : [],
        fixes: [
          {
            label: "Add a final A",
            sections: insertAt(sections, lastBodyIndex(sections) + 1, verseOf(sections)),
          },
        ],
      });
    }
    return findings;
  }

  if (!isVerseChorus(type)) return findings;
  const chorusIdx = sections.flatMap((s, i) => (s.role === "chorus" ? [i] : []));
  if (chorusIdx.length < 2) return findings; // chorusReturns already covers this
  const chorusesBefore = chorusIdx.filter((i) => i < bridge).length;
  if (chorusesBefore < 2) {
    findings.push({
      rule: "R9",
      severity: "warning",
      basis: "convention",
      title: `Bridge comes after only ${chorusesBefore} chorus${chorusesBefore === 1 ? "" : "es"}`,
      why: "A bridge is contrast. It lands best after the verse and chorus have each been heard twice, so the ear is ready for something new.",
      source: FORM_SOURCE,
      sectionIndexes: [bridge],
      boundaries: bridge > 0 ? [bridge - 1] : [],
      fixes: [{ label: "Move the bridge after the second chorus", sections: move(sections, bridge, chorusIdx[1]! + 1) }],
    });
  }
  if (!sections.slice(bridge + 1).some((s) => s.role === "chorus")) {
    findings.push({
      rule: "R9",
      severity: "warning",
      basis: "convention",
      title: "No chorus after the bridge",
      why: "The bridge sets up a return. Ending on it, or going straight to the outro, leaves the contrast unresolved.",
      source: FORM_SOURCE,
      sectionIndexes: [bridge],
      boundaries: bridge < sections.length - 1 ? [bridge] : [],
      fixes: [{ label: "Add a chorus after the bridge", sections: insertAt(sections, bridge + 1, chorusOf(sections)) }],
    });
  }
  return findings;
}

/** Long strophic songs with no contrasting section can feel flat. */
function strophicContrast(sections: Section[], type: FormType): Finding[] {
  if (type !== "strophic" && type !== "12-bar-blues") return [];
  const verses = sections.filter((s) => s.role === "verse").length;
  const contrast = sections.some((s) => ["bridge", "solo", "instrumental", "interlude"].includes(s.role));
  if (verses < 5 || contrast) return [];
  return [
    {
      rule: "R9",
      severity: "info",
      basis: "convention",
      title: `${verses} verses with no contrasting section`,
      why: "Strophic songs rely on the lyric to carry interest. Past four or five verses, a solo, instrumental break or bridge gives the ear a reset.",
      source: "Open Music Theory, strophic form",
      sectionIndexes: [],
      fixes: [
        {
          label: "Add an instrumental break after verse 3",
          sections: insertAt(
            sections,
            sections.flatMap((s, i) => (s.role === "verse" ? [i] : []))[2]! + 1,
            { role: "solo", bars: typicalBars(sections, "verse") ?? 8, intentional: false },
          ),
        },
      ],
    },
  ];
}

/** R10 (info): bridge placement, against where corpus bridges start (10th–90th percentile). */
function bridgePosition(sections: Section[], type: FormType): Finding[] {
  if (!isVerseChorus(type)) return [];
  const bridge = sections.findIndex((s) => s.role === "bridge");
  if (bridge < 0) return [];
  const chorusesBefore = sections.slice(0, bridge).filter((s) => s.role === "chorus").length;
  if (chorusesBefore < 2) return []; // contrastAfterRepetition covers it
  const pct = Math.round((startBar(sections, bridge) / totalBars(sections)) * 100);
  const [low, high] = [Math.round(bridgeStart.p10 * 100), Math.round(bridgeStart.p90 * 100)];
  if (pct >= low && pct <= high) return [];
  return [
    {
      rule: "R10",
      severity: "info",
      basis: "convention",
      title: `Bridge starts ${pct}% of the way through`,
      why: `In the Billboard corpus, 8 in 10 bridges that follow two choruses start between ${low}% and ${high}% of the way in (median ${Math.round(bridgeStart.p50 * 100)}%); post-2000 pop puts them nearer two-thirds. Claims of an ideal golden-ratio point aren't backed by pop research, so treat this as a loose guide.`,
      source: `${CORPUS_SOURCE}; Schwitzgebel, MTO 31.1 (2025)`,
      sectionIndexes: [bridge],
      fixes: [],
    },
  ];
}

/** R12 (info): overall length. Short forms are not flagged: most sketches are partial songs. */
function totalLength(sections: Section[], opts: Options): Finding[] {
  const sec = secondsFor(totalBars(sections), opts);
  if (sec <= 330) return [];
  return [
    {
      rule: "R12",
      severity: "info",
      basis: "convention",
      title: `Total length ${formatSeconds(sec)}`,
      why: "Most pop songs run 2:30–4:00. Longer forms work, but each extra section needs a reason to exist.",
      source: "Convention",
      sectionIndexes: [],
      fixes: [],
    },
  ];
}

/** Below this share of corpus hand-offs, a move from one section to the next is called rare. */
const RARE_TRANSITION = 0.01;

/** "a verse", "an intro". */
function aRole(role: Role): string {
  const name = NAME[role].toLowerCase();
  return `${/^[aeiou]/.test(name) ? "an" : "a"} ${name}`;
}

function after(next: Step): string {
  return next === "end" ? "end the song" : `lead into ${aRole(next as Role)}`;
}

function transitionNote(from: Role | "start", to: Role | "end"): { title: string; why: string } {
  const share = formatShare(transitionShare(from, to));
  const usual = usualNext(from);
  const most = `(${formatShare(usual.share)})`;
  const tail = "A rare hand-off can be striking, so keep it if it's on purpose.";
  if (from === "start") {
    const opener = aRole(to as Role); // a song never opens on its end
    return {
      title: `Opening with ${opener} is rare`,
      why: `In the Billboard corpus, ${share} of songs open with ${opener}; most open with ${aRole(usual.to as Role)} ${most}. ${tail}`,
    };
  }
  const plural = pluralName(from);
  if (to === "end")
    return {
      title: `Ending on ${aRole(from)} is rare`,
      why: `In the Billboard corpus, ${share} of ${plural} end the song; most ${after(usual.to)} ${most}. ${tail}`,
    };
  return {
    title: `${NAME[from]} into ${NAME[to].toLowerCase()} is rare`,
    why: `In the Billboard corpus, ${share} of ${plural} go straight to ${aRole(to)}; most ${after(usual.to)} ${most}. ${tail}`,
  };
}

/** R11 (info): hand-offs that hit songs almost never make, from the corpus transition counts. */
function rareTransitions(sections: Section[]): Finding[] {
  if (sections.length === 0) return [];
  const steps: Step[] = ["start", ...sections.map((s) => s.role), "end"];
  // Hand-off k is steps[k] → steps[k + 1]. Section i is steps[i + 1], so hand-off k is boundary k - 1.
  const byPair = new Map<string, number[]>();
  for (let k = 0; k + 1 < steps.length; k++) {
    const [from, to] = [steps[k]!, steps[k + 1]!];
    if (transitionCount(from) < MIN_SAMPLE || transitionShare(from, to) >= RARE_TRANSITION) continue;
    byPair.set(`${from}>${to}`, [...(byPair.get(`${from}>${to}`) ?? []), k]);
  }
  return [...byPair].map(([pair, ks]): Finding => {
    const [from, to] = pair.split(">") as [Role | "start", Role | "end"];
    return {
      rule: "R11",
      severity: "info",
      basis: "convention",
      ...transitionNote(from, to),
      source: CORPUS_SOURCE,
      sectionIndexes: [...new Set(ks.flatMap((k) => [k - 1, k].filter((i) => i >= 0 && i < sections.length)))],
      boundaries: ks.map((k) => k - 1).filter((b) => b >= 0 && b < sections.length - 1),
      fixes: [],
    };
  });
}

export function macroRules(sections: Section[], type: FormType, opts: Options): Finding[] {
  const findings = [
    ...firstChorusDelay(sections, type, opts),
    ...chorusReturns(sections, type),
    ...contrastAfterRepetition(sections, type),
    ...timeToChorus(sections, type, opts),
    ...strophicContrast(sections, type),
    ...bridgePosition(sections, type),
    ...totalLength(sections, opts),
  ];
  // A rare hand-off another rule already explains (a bridge that ends the song) needs no second note.
  const covered = new Set(findings.flatMap((f) => f.sectionIndexes));
  return [...findings, ...rareTransitions(sections).filter((f) => !f.sectionIndexes.some((i) => covered.has(i)))];
}
