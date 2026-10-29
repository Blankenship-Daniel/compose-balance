import { boardSection, expect, expectSong, hash, open, song, test } from "./fixtures.ts";

test.describe("undo and the URL", () => {
  test("Cmd/Ctrl+Z undoes, one step at a time", async ({ page }) => {
    await open(page, { form: "Vs8 Ch8" });
    const label = boardSection(page, 1).label;
    await label.focus();
    await page.keyboard.press("+");
    await page.keyboard.press("+");
    await expectSong(page, "Vs8 Ch10");
    await page.locator(".masthead").click({ position: { x: 5, y: 5 } });
    await page.keyboard.press("ControlOrMeta+z");
    await expectSong(page, "Vs8 Ch9");
    await page.keyboard.press("ControlOrMeta+z");
    await expectSong(page, "Vs8 Ch8");
    await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled();
  });

  test("a reload keeps the song, tempo, meter and era", async ({ page }) => {
    await open(page, { form: "Vs8 Ch8" });
    await boardSection(page, 1).label.focus();
    await page.keyboard.press("+");
    await page.getByLabel(/Tempo in/).fill("132");
    await page.getByLabel("Time signature").fill("6/8");
    await page.getByLabel("Compare against").selectOption("classic");
    await expect.poll(async () => (await hash(page)).era).toBe("classic");
    await page.reload();
    expect(await song(page)).toBe("Vs8 Ch9");
    await expect(page.getByLabel(/Tempo in/)).toHaveValue("132");
    await expect(page.getByLabel("Time signature")).toHaveValue("6/8");
    await expect(page.getByLabel("Compare against")).toHaveValue("classic");
  });

  test("a bad meter or era in the URL falls back to the defaults", async ({ page }) => {
    await page.goto("/#f=Vs8%20Ch8&bpm=100&m=banana&era=future");
    await expect(page.getByLabel("Time signature")).toHaveValue("4/4");
    await expect(page.getByLabel("Compare against")).toHaveValue("modern");
  });

  test("a bad form in the URL still opens the app", async ({ page }) => {
    await page.goto("/#f=Xx9%20Vs8&bpm=100&m=4%2F4");
    await expect(page.locator(".masthead")).toBeVisible();
  });

  test("changing the URL's hash on an open page loads that song", async ({ page }) => {
    await open(page, { form: "Vs8 Ch8" });
    await page.evaluate(() => (location.hash = "#f=In4%20Br8&bpm=80&m=3%2F4"));
    await expectSong(page, "In4 Br8");
    await expect(page.locator(".overlay .section-marks")).toHaveCount(2);
    await expect(boardSection(page, 0).text).toContainText("In4");
    await expect(boardSection(page, 1).text).toContainText("Br8");
    await expect(page.getByLabel(/Tempo in/)).toHaveValue("80");
    await expect(page.getByLabel("Time signature")).toHaveValue("3/4");
  });

  test("Undo after a board drag puts the pieces back", async ({ page }) => {
    await open(page, { form: "Vs8 Ch8" });
    const before = await page.evaluate(() => JSON.stringify((document.querySelector("lattice-board") as unknown as { pieces: { parts: unknown }[] }).pieces.map((p) => p.parts)));
    const box = (await boardSection(page, 1).outline.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.6);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.6 + 150, { steps: 10 });
    await page.mouse.up();
    await expect(page.getByRole("button", { name: "Undo" })).toBeEnabled();
    await page.getByRole("button", { name: "Undo" }).click();
    await expect
      .poll(() => page.evaluate(() => JSON.stringify((document.querySelector("lattice-board") as unknown as { pieces: { parts: unknown }[] }).pieces.map((p) => p.parts))))
      .toBe(before);
  });
});
