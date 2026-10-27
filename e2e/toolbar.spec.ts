import { expect, expectSong, hash, menu, open, test } from "./fixtures.ts";

test.describe("toolbar", () => {
  test("loads the song, tempo and meter from the URL", async ({ page }) => {
    await open(page, { form: "In4 Vs8 Ch8", bpm: 96, meter: "6/8" });
    await expect(page.getByLabel(/Tempo in/)).toHaveValue("96");
    await expect(page.getByLabel("Time signature")).toHaveValue("6/8");
    await expect(page.locator(".overlay .section-marks")).toHaveCount(3);
  });

  test("with no song in the URL, opens on the first example", async ({ page }) => {
    await open(page);
    await expectSong(page, "In4 Vs8 Pre4 Ch8 Vs8 Pre4 Ch8 Br8 Ch8 Ch8 Out4");
    await expect(page.getByLabel(/Tempo in/)).toHaveValue("110");
  });

  test("clamps the tempo to 20–400 and treats blank as 100", async ({ page }) => {
    await open(page, { form: "Vs8 Ch8" });
    const bpm = page.getByLabel(/Tempo in/);
    await bpm.fill("1000");
    await expect.poll(async () => (await hash(page)).bpm).toBe("400");
    await bpm.fill("5");
    await expect.poll(async () => (await hash(page)).bpm).toBe("20");
    await bpm.fill("");
    await expect.poll(async () => (await hash(page)).bpm).toBe("100");
  });

  test("a tempo outside 20–400 in the URL is clamped too", async ({ page }) => {
    await open(page, { form: "Vs8 Ch8", bpm: 5000 });
    await expect(page.getByLabel(/Tempo in/)).toHaveValue("400");
  });

  test("an invalid time signature shows an error and keeps the last good one", async ({ page }) => {
    await open(page, { form: "Vs8 Ch8" });
    const meter = page.getByLabel("Time signature");
    await meter.fill("7/");
    await expect(meter).toHaveAttribute("aria-invalid", "true");
    await expect(page.locator("ul.errors")).toContainText("Time signature");
    expect((await hash(page)).m).toBe("4/4");
    await meter.fill("7/8");
    await expect(meter).toHaveAttribute("aria-invalid", "false");
    await expect.poll(async () => (await hash(page)).m).toBe("7/8");
  });

  test("the era is kept in the URL and changes the comparison", async ({ page }) => {
    await open(page, { form: "In4 Vs8 Ch8 Vs8 Ch8" });
    const rank = page.locator(".verdict-rank");
    const modern = await rank.textContent();
    await page.getByLabel("Compare against").selectOption("classic");
    await expect.poll(async () => (await hash(page)).era).toBe("classic");
    await expect(rank).not.toHaveText(modern ?? "");
    await expect(rank).toContainText("classic");
  });

  test("Table and Chart switch views and the choice is remembered", async ({ page }) => {
    await open(page, { form: "Vs8 Ch8" });
    await page.getByRole("button", { name: "Chart", exact: true }).click();
    await expect(page.locator(".chart")).toBeVisible();
    await page.reload();
    await expect(page.locator(".chart")).toBeVisible();
    await page.getByRole("button", { name: "Table", exact: true }).click();
    await expect(page.locator("lattice-board")).toBeVisible();
  });

  test("a preset from the menu loads its form and tempo", async ({ page }) => {
    await open(page, { form: "Vs8 Ch8", bpm: 100 });
    await menu(page).click();
    await page.getByRole("button", { name: "Rock: verse–chorus–bridge" }).click();
    await expectSong(page, "In4 Vs8 Ch8 Vs8 Ch8 Solo8 Br8 Ch8 Out4");
    await expect(page.getByLabel(/Tempo in/)).toHaveValue("120");
  });

  test("undoing a preset puts back the song and its tempo", async ({ page }) => {
    await open(page, { form: "Vs8 Ch8", bpm: 100 });
    await menu(page).click();
    await page.getByRole("button", { name: "Rock: verse–chorus–bridge" }).click();
    await expect(page.getByLabel(/Tempo in/)).toHaveValue("120");
    await page.getByRole("button", { name: "Undo" }).click();
    await expectSong(page, "Vs8 Ch8");
    await expect(page.getByLabel(/Tempo in/)).toHaveValue("100");
  });

  test("the menu closes on Escape and on a click outside", async ({ page }) => {
    await open(page, { form: "Vs8 Ch8" });
    const more = menu(page);
    await more.click();
    await expect(page.locator(".menu-list")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator(".menu-list")).toBeHidden();
    await more.click();
    await page.locator(".masthead").click({ position: { x: 5, y: 5 } });
    await expect(page.locator(".menu-list")).toBeHidden();
  });

  test("How this works opens Help, and Close or Escape shuts it", async ({ page }) => {
    await open(page, { form: "Vs8 Ch8" });
    await menu(page).click();
    await page.getByRole("button", { name: "How this works" }).click();
    const help = page.locator(".panel");
    await expect(help).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(help).toBeHidden();
  });

  test("Play is disabled with no song, Undo with nothing to undo", async ({ page }) => {
    await open(page, { form: "Vs8", typing: true });
    await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled();
    await page.getByLabel("Form as text").fill("");
    await expect(page.getByRole("button", { name: /Play/ })).toBeDisabled();
  });

  test("Space plays and stops, but not while typing", async ({ page }) => {
    await open(page, { form: "Vs8 Ch8" });
    const play = page.locator("button.play");
    await page.locator(".masthead").click({ position: { x: 5, y: 5 } });
    await page.keyboard.press(" ");
    await expect(play).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press(" ");
    await expect(play).toHaveAttribute("aria-pressed", "false");
    await page.getByLabel("Time signature").focus();
    await page.keyboard.press(" ");
    await expect(play).toHaveAttribute("aria-pressed", "false");
  });
});
