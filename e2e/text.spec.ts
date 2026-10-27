import { expect, expectSong, open, test } from "./fixtures.ts";

test.describe("text entry", () => {
  test("typing a form updates the song and the board", async ({ page }) => {
    await open(page, { form: "Vs8", typing: true });
    const field = page.getByLabel("Form as text");
    await field.fill("In4 Vs8 Ch7!");
    await expectSong(page, "In4 Vs8 Ch7!");
    await expect(page.locator(".overlay .section-marks")).toHaveCount(3);
  });

  test("an unknown code shows an error and leaves the song alone", async ({ page }) => {
    await open(page, { form: "Vs8 Ch8", typing: true });
    const field = page.getByLabel("Form as text");
    await field.fill("Vs8 Xx8");
    await expect(field).toHaveAttribute("aria-invalid", "true");
    await expect(page.locator("ul.errors li")).not.toHaveCount(0);
    await expectSong(page, "Vs8 Ch8");
  });

  test("leaving Text with a half-typed form shows the last good one", async ({ page }) => {
    await open(page, { form: "Vs8 Ch8", typing: true });
    await page.getByLabel("Form as text").fill("Vs8 Ch");
    await page.getByRole("button", { name: "Text" }).click();
    await page.getByRole("button", { name: "Text" }).click();
    await expect(page.getByLabel("Form as text")).toHaveValue("Vs8 Ch8");
    await expect(page.locator("ul.errors")).toBeHidden();
  });

  test("Escape in the field leaves Text", async ({ page }) => {
    await open(page, { form: "Vs8 Ch8", typing: true });
    await page.getByLabel("Form as text").press("Escape");
    await expect(page.getByLabel("Form as text")).toBeHidden();
  });

  test("Escape in the field leaves Text but keeps Shears on", async ({ page }) => {
    await open(page, { form: "Vs8 Ch8", typing: true });
    await page.getByRole("button", { name: "Shears" }).click();
    await expect(page.getByRole("button", { name: "Shears" })).toHaveAttribute("aria-pressed", "true");
    await page.getByLabel("Form as text").press("Escape");
    await expect(page.getByLabel("Form as text")).toBeHidden();
    // One Escape, one thing closed: the field, not the tool picked before it.
    await expect(page.getByRole("button", { name: "Shears" })).toHaveAttribute("aria-pressed", "true");
  });

  test("the Text choice is remembered across a reload", async ({ page }) => {
    await open(page, { form: "Vs8 Ch8" });
    await page.getByRole("button", { name: "Text" }).click();
    await expect(page.getByLabel("Form as text")).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Form as text")).toBeVisible();
  });

  test("an empty field shows the code hint", async ({ page }) => {
    await open(page, { form: "Vs8", typing: true });
    await page.getByLabel("Form as text").fill("");
    await expect(page.locator("p.hint")).toBeVisible();
  });

  test("each typed change is one undo step", async ({ page }) => {
    await open(page, { form: "Vs8", typing: true });
    const field = page.getByLabel("Form as text");
    await field.fill("Vs8 Ch8");
    await expectSong(page, "Vs8 Ch8");
    await page.locator(".masthead").click({ position: { x: 5, y: 5 } });
    await page.getByRole("button", { name: "Undo" }).click();
    await expectSong(page, "Vs8");
    await expect(field).toHaveValue("Vs8");
  });
});
