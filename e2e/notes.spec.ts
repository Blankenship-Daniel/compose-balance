import { expect, expectSong, open, test } from "./fixtures.ts";

test.describe("notes on the board", () => {
  test("a warning pins a note that opens, applies a fix and closes", async ({ page }) => {
    await open(page, { form: "Vs8 Ch8 Vs8 Ch7 Ch8" });
    const pin = page.locator("button.pin").first();
    await expect(pin).toBeVisible();
    await pin.click();
    const note = page.locator(".pin-note");
    await expect(note).toBeVisible();
    await note.getByRole("button", { name: "Make it 8 bars" }).click();
    await expectSong(page, "Vs8 Ch8 Vs8 Ch8 Ch8");
    await expect(note).toBeHidden();
    await expect(page.locator("button.pin")).toHaveCount(0);
  });

  test("an open note closes on Escape, on ×, and on a click outside", async ({ page }) => {
    await open(page, { form: "Vs8 Ch8 Vs8 Ch7 Ch8" });
    const pin = page.locator("button.pin").first();
    const note = page.locator(".pin-note");
    await pin.click();
    await page.keyboard.press("Escape");
    await expect(note).toBeHidden();
    await pin.click();
    await note.getByRole("button", { name: "Close note" }).click();
    await expect(note).toBeHidden();
    await pin.click();
    await page.locator(".masthead").click({ position: { x: 5, y: 5 } });
    await expect(note).toBeHidden();
  });

  test("the verdict's count opens the worst note", async ({ page }) => {
    await open(page, { form: "Vs8 Vs8 Ch7" });
    await page.locator(".verdict-counts").first().click();
    await expect(page.locator(".pin-note")).toBeVisible();
  });

  test("the verdict's notes link opens the shelf of other notes", async ({ page }) => {
    await open(page, { form: "Vs8 Ch6 Vs8 Ch6" });
    const shelf = page.locator("details.shelf");
    await expect(shelf).not.toHaveAttribute("open", "");
    await page.locator(".verdict-counts", { hasText: /note/ }).click();
    await expect(shelf).toHaveAttribute("open", "");
  });

  test("a fix from the shelf applies", async ({ page }) => {
    await open(page, { form: "Vs8 Ch6 Vs8 Ch6" });
    await page.locator(".verdict-counts", { hasText: /note/ }).click();
    await page.locator("details.shelf").getByRole("button", { name: "Make them 8 bars" }).click();
    await expectSong(page, "Vs8 Ch8 Vs8 Ch8");
  });

  test("a clean song says so and offers no notes", async ({ page }) => {
    await open(page, { form: "In4 Vs8 Pre4 Ch8 Vs8 Pre4 Ch8 Br8 Ch8 Out4" });
    await expect(page.locator(".verdict-word")).toHaveText("Balanced");
    await expect(page.locator("button.pin")).toHaveCount(0);
  });
});
