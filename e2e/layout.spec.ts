import { expect, open, song, test } from "./fixtures.ts";

const SONG = "In4 Vs8 Pre4 Ch7 Vs8 Pre4 Ch8 Inst4 Br8 Ch8 Out4";

test("opening a song keeps it as written, laid out without overlaps", async ({ page }) => {
  await open(page, { form: SONG });
  await page.waitForTimeout(800);
  expect(await song(page)).toBe(SONG);
  // No two section labels on top of each other.
  const boxes = await page.locator("text[id^=section-]").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON()));
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      const overlap = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
      expect(overlap, `labels ${i + 1} and ${j + 1} overlap`).toBe(false);
    }
});

test("opening a note leaves the song and its layout alone", async ({ page }) => {
  await open(page, { form: SONG });
  const width = () => page.evaluate(() => Math.round(document.querySelector("lattice-board")!.getBoundingClientRect().width));
  const w0 = await width();
  await page.locator("button.pin").first().click();
  await expect(page.locator(".pin-note")).toBeVisible();
  await page.waitForTimeout(500);
  expect(await width(), "board width").toBe(w0);
  expect(await song(page)).toBe(SONG);
});

for (const narrowTo of [400, 900])
  test(`resizing the window to ${narrowTo}px and back keeps the song and a clean layout`, async ({ page }) => {
    await open(page, { form: SONG });
    const size = page.viewportSize()!;
    await page.setViewportSize({ width: narrowTo, height: size.height });
    await page.waitForTimeout(300);
    await page.setViewportSize(size);
    await page.waitForTimeout(500);
    expect(await song(page)).toBe(SONG);
    const boxes = await page.locator("text[id^=section-]").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON()));
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], b = boxes[j];
        expect(a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height, `labels ${i + 1} and ${j + 1} overlap`).toBe(false);
      }
  });
