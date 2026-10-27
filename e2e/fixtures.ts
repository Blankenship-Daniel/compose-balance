import { expect, type Locator, type Page, test as base } from "@playwright/test";

/**
 * A silent AudioContext whose clock is the page's: playback runs (and lights bars) without sound
 * or an audio device. Covers what src/audio/player.ts uses.
 */
function fakeAudio() {
  const param = () => ({
    value: 0,
    setValueAtTime() {},
    setTargetAtTime() {},
    linearRampToValueAtTime() {},
    exponentialRampToValueAtTime() {},
    cancelScheduledValues() {},
  });
  const node = () => ({ connect: (to: unknown) => to, disconnect() {} });
  class FakeAudioContext {
    private born = performance.now();
    destination = node();
    state = "running";
    get currentTime() {
      return (performance.now() - this.born) / 1000;
    }
    createGain() {
      return { ...node(), gain: param() };
    }
    createOscillator() {
      return { ...node(), type: "sine", frequency: param(), start() {}, stop() {} };
    }
    close() {
      this.state = "closed";
      return Promise.resolve();
    }
    resume() {
      return Promise.resolve();
    }
  }
  (window as unknown as { AudioContext: unknown }).AudioContext = FakeAudioContext;
}

interface Fixtures {
  /** Console errors and uncaught exceptions seen by the page; each test fails if any. */
  errors: string[];
}

export const test = base.extend<Fixtures>({
  errors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
      page.on("console", (m) => m.type() === "error" && errors.push(`console: ${m.text()}`));
      await page.addInitScript(fakeAudio);
      // The one outside request (Google Fonts): answered empty, so runs are offline and steady.
      await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
      await use(errors);
      expect(errors, "console errors / exceptions").toEqual([]);
    },
    { auto: true },
  ],
});
export { expect };

/** The toolbar's "…" menu button (the tray also has a "More…" toggle). */
export const menu = (page: Page) => page.getByRole("button", { name: "More", exact: true });

export interface Open {
  form?: string;
  bpm?: number;
  meter?: string;
  era?: "modern" | "classic";
  view?: "table" | "chart";
  typing?: boolean;
}

/** Loads the app with a song in its URL hash and fresh preferences. */
export async function open(page: Page, o: Open = {}) {
  await page.addInitScript(
    ({ view, typing }) => {
      // Once per test, not on every reload: a reload must see what the app itself saved.
      try {
        if (sessionStorage.getItem("e2e:seeded")) return;
        sessionStorage.setItem("e2e:seeded", "1");
        localStorage.setItem("compose-balance:view", view);
        localStorage.setItem("compose-balance:typing", typing ? "1" : "0");
      } catch {
        // Storage blocked: the defaults stand.
      }
    },
    { view: o.view ?? "table", typing: o.typing ?? false },
  );
  const hash = o.form === undefined ? "" : `#f=${encodeURIComponent(o.form)}&bpm=${o.bpm ?? 100}&m=${encodeURIComponent(o.meter ?? "4/4")}${o.era ? `&era=${o.era}` : ""}`;
  await page.goto(`/${hash}`);
  await expect(page.locator(".masthead")).toBeVisible();
  if ((o.view ?? "table") === "table" && o.form) {
    await expect(page.locator(".section-outline").first()).toBeAttached();
    // The first frame is drawn at a default width, before the table has been measured.
    await expect
      .poll(() => page.evaluate(() => document.querySelector("lattice-board")!.getBoundingClientRect().right <= document.querySelector(".table")!.getBoundingClientRect().right + 1))
      .toBe(true);
  }
}

/** A toolbar control, opening the phone toolbar's Settings first when it is folded away there. */
export async function toolbarButton(page: Page, name: string) {
  const button = page.getByRole("button", { name, exact: true });
  const settings = page.getByRole("button", { name: "Settings", exact: true });
  if (!(await button.isVisible()) && (await settings.isVisible())) await settings.click();
  return button;
}

/** The URL hash's parameters: the app writes the song, tempo, meter and era there on every change. */
export async function hash(page: Page): Promise<{ f: string; bpm: string; m: string; era: string | null }> {
  const params = new URLSearchParams((await page.evaluate(() => location.hash)).slice(1));
  return { f: params.get("f") ?? "", bpm: params.get("bpm") ?? "", m: params.get("m") ?? "", era: params.get("era") };
}

/** The song now, as the app formats it ("In4 Vs8 Ch8"). */
export async function song(page: Page): Promise<string> {
  return (await hash(page)).f;
}

/** Waits until the song is `form`. */
export async function expectSong(page: Page, form: string) {
  await expect.poll(() => song(page)).toBe(form);
}

/** Section `i` on the board: its outline (for its box) and its label. */
export function boardSection(page: Page, i: number): { outline: Locator; label: Locator; hit: Locator } {
  const marks = page.locator(".overlay .section-marks").nth(i);
  return { outline: marks.locator(".section-outline"), label: page.locator(`text#section-${i}`), hit: marks.locator(".label-hit") };
}

/** The middle of section `i` on the board, in page pixels. */
export async function sectionCentre(page: Page, i: number): Promise<{ x: number; y: number }> {
  const box = await boardSection(page, i).outline.boundingBox();
  if (!box) throw new Error(`section ${i} has no box`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** A point on section `i`'s first piece: the middle of its first block, found in the board itself. */
export async function onPiece(page: Page, i: number): Promise<{ x: number; y: number }> {
  const box = await boardSection(page, i).outline.boundingBox();
  if (!box) throw new Error(`section ${i} has no box`);
  // Search the section's box for a point the board says is a piece.
  const hit = await page.evaluate(
    ({ b }) => {
      const board = document.querySelector("lattice-board")!;
      for (let fy = 0.5; fy < 0.95; fy += 0.1)
        for (let fx = 0.5; fx > 0.05; fx -= 0.1)
          for (const x of [b.x + b.width * fx, b.x + b.width * (1 - fx)]) {
            const y = b.y + b.height * fy;
            if (board.shadowRoot?.elementsFromPoint(x, y).some((el) => el.closest(".piece"))) return { x, y };
          }
      return null;
    },
    { b: box },
  );
  if (!hit) throw new Error(`no piece found in section ${i}`);
  return hit;
}

/** Drags with the mouse in small steps, as a person would. */
export async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, opts: { alt?: boolean } = {}) {
  if (opts.alt) await page.keyboard.down("Alt");
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let k = 1; k <= 12; k++) await page.mouse.move(from.x + ((to.x - from.x) * k) / 12, from.y + ((to.y - from.y) * k) / 12);
  await page.mouse.up();
  if (opts.alt) await page.keyboard.up("Alt");
}

/** Picks section `i` with the mouse, by its label, and returns the tray's actions bar. */
export async function pick(page: Page, i: number): Promise<Locator> {
  await boardSection(page, i).hit.click();
  const actions = page.locator(".section-actions");
  await expect(actions).toBeVisible();
  return actions;
}

/** The board's pieces as the cells and triangles they cover, without ids: to compare layouts. */
export async function cells(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    (document.querySelector("lattice-board") as unknown as { pieces: { parts: unknown[] }[] }).pieces
      .map((p) => JSON.stringify(p.parts))
      .sort(),
  );
}

/** Clicks a piece of section `i`, and waits until the board has given it the keyboard. */
export async function focusPiece(page: Page, i: number) {
  const at = await onPiece(page, i);
  await page.mouse.click(at.x, at.y);
  await expect
    .poll(() => page.evaluate(() => document.querySelector("lattice-board")?.shadowRoot?.activeElement?.classList.contains("piece") ?? false))
    .toBe(true);
}

/** The number of pieces on the board. */
export const pieceCount = (page: Page) =>
  page.evaluate(() => (document.querySelector("lattice-board") as unknown as { pieces: unknown[] }).pieces.length);
