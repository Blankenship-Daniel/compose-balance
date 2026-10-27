import { expect, expectSong, open, song, test } from "./fixtures.ts";

test.describe("chart view", () => {
  test("four bars to a line, and a bar click plays from there", async ({ page }) => {
    await open(page, { form: "Vs8 Ch8", view: "chart" });
    await expect(page.locator("#section-0 .system")).toHaveCount(2);
    await page.getByLabel("Play from bar 9, Chorus bar 1").click();
    await expect(page.locator("button.play")).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".bar.is-playing")).toHaveAttribute("aria-label", /Play from bar (9|10),/);
  });

  test("− + duplicate and prune per section", async ({ page }) => {
    await open(page, { form: "Vs8 Ch8", view: "chart" });
    await page.getByLabel("Add a bar to Chorus").click();
    await expectSong(page, "Vs8 Ch9");
    await page.getByLabel("Remove a bar from Chorus").click();
    await page.getByLabel("Remove a bar from Chorus").click();
    await expectSong(page, "Vs8 Ch7");
    await page.getByLabel("Duplicate Verse").click();
    await expectSong(page, "Vs8 Vs8 Ch7");
    await page.getByLabel("Prune Chorus").click();
    await expectSong(page, "Vs8 Vs8");
  });

  test("− stops at 1 bar and + at 64", async ({ page }) => {
    await open(page, { form: "Vs1 Ch64", view: "chart" });
    await page.getByLabel("Remove a bar from Verse").click();
    await page.getByLabel("Add a bar to Chorus").click();
    await page.waitForTimeout(200);
    await expectSong(page, "Vs1 Ch64");
  });

  test("a ghost slot extends the section to that bar", async ({ page }) => {
    await open(page, { form: "Vs8 Ch6", view: "chart" });
    await page.getByLabel("Extend Chorus to 8 bars").click();
    await expectSong(page, "Vs8 Ch8");
  });

  test("dragging a section's mark moves it", async ({ page }) => {
    await open(page, { form: "Vs8 Ch8 Br8", view: "chart" });
    await page.locator("#section-2 .mark-handle").dragTo(page.locator("#section-0"));
    await expectSong(page, "Br8 Vs8 Ch8");
  });

  test("the add buttons append a section of the usual length", async ({ page }) => {
    await open(page, { form: "Vs8", view: "chart" });
    await page.locator(".add").getByRole("button", { name: "Chorus", exact: true }).click();
    await expectSong(page, "Vs8 Ch8");
    await page.locator(".add").getByRole("button", { name: "More…" }).click();
    await page.locator(".add").getByRole("button", { name: "Coda", exact: true }).click();
    await expect.poll(() => song(page)).toMatch(/^Vs8 Ch8 Coda\d+$/);
  });

  test("a note's title scrolls to and highlights its section", async ({ page }) => {
    await open(page, { form: "Vs8 Vs8 Ch7", view: "chart" });
    await page.locator("#findings .note-title", { hasText: "7-bar chorus" }).click();
    await expect(page.locator("#section-2")).toHaveClass(/is-highlighted/);
    await expect(page.locator("#section-2")).not.toHaveClass(/is-highlighted/, { timeout: 4000 });
  });

  test("a fix in the findings list applies", async ({ page }) => {
    await open(page, { form: "Vs8 Vs8 Ch7", view: "chart" });
    await page.locator("#findings").getByRole("button", { name: "Make it 8 bars" }).click();
    await expectSong(page, "Vs8 Vs8 Ch8");
  });

  test("Shears across a section's bars cuts at the nearest barline", async ({ page }) => {
    await open(page, { form: "Vs8 Ch8", view: "chart" });
    await page.getByRole("button", { name: "Shears" }).click();
    // Down through the chorus's second line, between bars 6 and 7.
    const bar = (await page.getByLabel("Play from bar 15, Chorus bar 7").boundingBox())!;
    const x = bar.x + 2;
    await page.mouse.move(x, bar.y - 10);
    await page.mouse.down();
    await page.mouse.move(x, bar.y + bar.height + 10, { steps: 8 });
    await page.mouse.up();
    await expectSong(page, "Vs8 Ch6");
  });

  test("the verdict's count scrolls to the findings in the chart", async ({ page }) => {
    await open(page, { form: "Vs8 Vs8 Ch7", view: "chart" });
    await page.locator(".verdict-counts").first().click();
    await expect(page.locator("#findings")).toBeInViewport();
  });

  test("an empty song shows how to start", async ({ page }) => {
    await open(page, { form: "Vs8", view: "chart" });
    await page.getByLabel("Prune Verse").click();
    await expect(page.locator(".chart-empty")).toBeVisible();
  });
});
