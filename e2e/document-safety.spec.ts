import { boardSection, expect, hash, menu, open, test } from "./fixtures.ts";

async function exchange(page: import("@playwright/test").Page) {
  await menu(page).click();
  await page.getByRole("button", { name: "Import or export…" }).click();
}

test("imported chords survive reload and presets replace them", async ({ page }) => {
  await open(page, { form: "Vs8 Ch8" });
  await exchange(page);
  await page.getByLabel("Annotation text").fill("0\tA, verse, | F#:min7 | N |\n4\tend");
  await page.getByRole("button", { name: "Import this text" }).click();
  await expect.poll(async () => (await hash(page)).f).toBe("Vs2");
  await page.reload();
  await exchange(page);
  await expect(page.getByLabel("Annotation text")).toHaveValue(/\| F#:min7 \| N \|/);
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await menu(page).click();
  await page.getByRole("button", { name: "Pop: verse–pre–chorus", exact: true }).click();
  await expect.poll(() => page.evaluate(() => new URLSearchParams(location.hash.slice(1)).has("d"))).toBe(false);
  await exchange(page);
  await expect(page.getByLabel("Annotation text")).not.toHaveValue(/F#:min7/);
});

test("legacy song links upgrade to lossless documents before reload", async ({ page }) => {
  await page.goto("/#f=In4%20Vs8&bpm=86&m=4%2F4&song=bb0473");
  await expect.poll(() => page.evaluate(() => new URLSearchParams(location.hash.slice(1)).has("d"))).toBe(true);
  // Corpus chunks are now cached: restoration can resolve before React commits the hash load.
  await page.evaluate(() => { location.hash = "#f=Vs8%20Ch2&bpm=92&m=4%2F4&song=bb0473"; });
  await expect(boardSection(page, 0).text).toContainText("Vs8");
  await expect.poll(() => page.evaluate(() => new URLSearchParams(location.hash.slice(1)).has("d"))).toBe(true);
  const before = await page.evaluate(() => new URLSearchParams(location.hash.slice(1)).get("d"));
  await page.reload();
  await expect.poll(() => page.evaluate(() => new URLSearchParams(location.hash.slice(1)).get("d"))).toBe(before);
  await expect(boardSection(page, 0).text).toContainText("Vs8");
});

test("moving a deliberate section retains its marker", async ({ page }) => {
  await open(page, { form: "Vs7! Ch8" });
  await boardSection(page, 0).label.focus();
  // The board's own piece keys move geometry without changing musical length.
  const piece = page.locator("lattice-board").locator(".piece").first();
  await piece.focus();
  await page.keyboard.press("ArrowDown");
  await expect.poll(async () => (await hash(page)).f).toContain("Vs7!");
});

test("unsafe imports report a problem without replacing the document", async ({ page }) => {
  await open(page, { form: "Vs8 Ch8" });
  await exchange(page);
  await page.getByLabel("Annotation text").fill("0\tA, verse, | C:maj | x999999999999999999999999\n2\tend");
  await page.getByRole("button", { name: "Import this text" }).click();
  await expect(page.locator(".import-notes")).toContainText(/limit|large|repeat|exceed/i);
  expect((await hash(page)).f).toBe("Vs8 Ch8");
});
