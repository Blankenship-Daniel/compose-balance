import { boardSection, drag, expect, expectSong, onPiece, open, pick, test } from "./fixtures.ts";

test.describe("board: a picked section's actions", () => {
  test("clicking a label picks the section and the tray shows its actions", async ({ page }) => {
    await open(page, { form: "Vs8 Ch8" });
    const actions = await pick(page, 1);
    await expect(actions.locator(".section-actions-name")).toHaveText("Chorus, 8 bars");
  });

  test("− and + change the length; Done and Escape let go", async ({ page }) => {
    await open(page, { form: "Vs8 Ch8" });
    const actions = await pick(page, 1);
    await actions.getByRole("button", { name: "One bar shorter" }).click();
    await expectSong(page, "Vs8 Ch7");
    await expect(actions.locator(".section-actions-name")).toHaveText("Chorus, 7 bars");
    await actions.getByRole("button", { name: "One bar longer" }).click();
    await actions.getByRole("button", { name: "One bar longer" }).click();
    await expectSong(page, "Vs8 Ch9");
    await actions.getByRole("button", { name: "Done" }).click();
    await expect(page.locator(".section-actions")).toBeHidden();
    await pick(page, 0);
    await page.keyboard.press("Escape");
    await expect(page.locator(".section-actions")).toBeHidden();
  });

  test("− is disabled at 1 bar", async ({ page }) => {
    await open(page, { form: "Vs8 Ch1" });
    const actions = await pick(page, 1);
    await expect(actions.getByRole("button", { name: "One bar shorter" })).toBeDisabled();
    await expect(actions.getByRole("button", { name: "Pull a bar" })).toBeDisabled();
  });

  test("Pull a bar makes a 1-bar section of the same type beside it", async ({ page }) => {
    await open(page, { form: "Vs8 Ch8" });
    const actions = await pick(page, 1);
    await actions.getByRole("button", { name: "Pull a bar" }).click();
    await expectSong(page, "Vs8 Ch7 Ch1");
  });

  test("Remove takes the section out and lets go", async ({ page }) => {
    await open(page, { form: "Vs8 Ch8 Br8" });
    const actions = await pick(page, 1);
    await actions.getByRole("button", { name: "Remove" }).click();
    await expectSong(page, "Vs8 Br8");
    await expect(page.locator(".section-actions")).toBeHidden();
  });

  test("Play starts from the section's first bar", async ({ page }) => {
    await open(page, { form: "Vs8 Ch8" });
    const actions = await pick(page, 1);
    await actions.getByRole("button", { name: "Play", exact: true }).click();
    await expect(page.locator("button.play")).toHaveAttribute("aria-pressed", "true");
    // Bar 9 onward: the elapsed time starts at the chorus, not at 0:00.
    await expect(page.locator(".duration")).toContainText(/0:(19|2\d) \//);
  });

  test("the picked section's length is right straight after a drop", async ({ page }) => {
    await open(page, { form: "Vs8 Ch8" });
    const actions = await pick(page, 1);
    // The tray now shows actions, not shapes: Done first, then drop a bar on the chorus.
    await expect(page.getByLabel("Add a bar of chorus")).toHaveCount(0);
    await actions.getByRole("button", { name: "Done" }).click();
    const shape = await page.getByLabel("Add a bar of chorus").boundingBox();
    await drag(page, { x: shape!.x + 15, y: shape!.y + 15 }, await onPiece(page, 1));
    await expectSong(page, "Vs8 Ch9");
    await pick(page, 1);
    await expect(page.locator(".section-actions-name")).toHaveText("Chorus, 9 bars");
    await expect(boardSection(page, 1).label).toHaveAttribute("aria-label", /Chorus, 9 bars/);
  });
});
