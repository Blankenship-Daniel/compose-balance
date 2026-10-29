import { expect, open, song, test } from "./fixtures.ts";

/**
 * Screenshots for a person to look at (dark mode, narrow screens), not compared against a
 * baseline. They land in test-results/ under each project's name.
 */
const SONG = "In4 Vs8 Pre4 Ch7 Vs8 Pre4 Ch8 Inst4 Br8 Ch8 Out4";

test("board", async ({ page }, info) => {
  await open(page, { form: SONG });
  await page.locator("button.pin").first().click();
  // Full-page: the page is resized for the shot, so this also checks a resize leaves the song be.
  await page.screenshot({ path: info.outputPath("board.png"), fullPage: true });
  expect(await song(page)).toBe(SONG);
  await expect(page.locator(".pin-note")).toBeVisible();
});

test("chart", async ({ page }, info) => {
  await open(page, { form: SONG, view: "chart" });
  await page.screenshot({ path: info.outputPath("chart.png"), fullPage: true });
});

test("text and errors", async ({ page }, info) => {
  await open(page, { form: SONG, typing: true });
  await page.getByLabel("Form as text").fill("In4 Vs8 Xx4");
  await page.screenshot({ path: info.outputPath("text.png") });
});

test("dark mode has a dark page", async ({ page }, info) => {
  test.skip(info.project.name !== "dark", "dark project only");
  await open(page, { form: SONG });
  // The sky behind everything (the body is transparent over it): it must turn dark with the page.
  const bg = await page.evaluate(() => getComputedStyle(document.querySelector("hex-sky")!).backgroundColor);
  const [r, g, b] = bg.match(/\d+/g)!.map(Number);
  expect((r! + g! + b!) / 3, `body background ${bg}`).toBeLessThan(80);
});
