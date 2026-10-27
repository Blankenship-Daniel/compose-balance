import { boardSection, cells, expect, expectSong, focusPiece, open, pick, pieceCount, song, test } from "./fixtures.ts";

test.describe("board: keys", () => {
  test("a section label takes + − Delete and Enter", async ({ page }) => {
    await open(page, { form: "Vs8 Ch8 Br8" });
    const label = boardSection(page, 1).label;
    await label.focus();
    await page.keyboard.press("+");
    await expectSong(page, "Vs8 Ch9 Br8");
    await page.keyboard.press("-");
    await page.keyboard.press("-");
    await expectSong(page, "Vs8 Ch7 Br8");
    await boardSection(page, 2).label.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("button.play")).toHaveAttribute("aria-pressed", "true");
    await boardSection(page, 0).label.focus();
    await page.keyboard.press("Delete");
    await expectSong(page, "Ch7 Br8");
  });

  test("− on a 1-bar section's label does nothing", async ({ page }) => {
    await open(page, { form: "Vs8 Ch1" });
    await boardSection(page, 1).label.focus();
    await page.keyboard.press("-");
    await page.waitForTimeout(200);
    expect(await song(page)).toBe("Vs8 Ch1");
  });

  test("R turns a piece and Shift+R turns it back to the same cells", async ({ page }) => {
    // On its own, with room to turn (a top-row chorus can't: the turn would leave the board).
    await open(page, { form: "Vs8" });
    const before = await cells(page);
    await focusPiece(page, 0);
    await page.keyboard.press("r");
    await expect.poll(() => cells(page)).not.toEqual(before);
    await page.keyboard.press("Shift+R");
    await expect.poll(() => cells(page)).toEqual(before);
    expect(await song(page)).toBe("Vs8");
  });

  test("Break splits a section into bars; Glue joins touching bars back", async ({ page }) => {
    await open(page, { form: "Vs8 Ch4" });
    const actions = await pick(page, 1);
    await actions.getByRole("button", { name: "Break" }).click();
    await expectSong(page, "Vs8 Ch1 Ch1 Ch1 Ch1");
    const broken = await pieceCount(page);
    await page.keyboard.press("Escape");
    await focusPiece(page, 2);
    await page.keyboard.press("g");
    await expect.poll(() => pieceCount(page)).toBeLessThan(broken);
  });

  test("after Break, every bar's label can still be clicked to pick it", async ({ page }) => {
    await open(page, { form: "Vs8 Ch4" });
    const actions = await pick(page, 1);
    await actions.getByRole("button", { name: "Break" }).click();
    await expectSong(page, "Vs8 Ch1 Ch1 Ch1 Ch1");
    await page.keyboard.press("Escape");
    await expect(page.locator("button.pin")).not.toHaveCount(0);
    for (let i = 1; i <= 4; i++) {
      await pick(page, i);
      await page.keyboard.press("Escape");
    }
  });

  test("arrow keys move a piece and the song keeps its order", async ({ page }) => {
    await open(page, { form: "Vs8 Ch8" });
    const before = await cells(page);
    await focusPiece(page, 1);
    await page.keyboard.press("ArrowDown");
    await expect.poll(() => cells(page)).not.toEqual(before);
    expect(await song(page)).toBe("Vs8 Ch8");
  });

  test("Delete on a focused piece throws the section away", async ({ page }) => {
    await open(page, { form: "Vs8 Ch8 Br8" });
    await focusPiece(page, 1);
    await page.keyboard.press("Delete");
    await expectSong(page, "Vs8 Br8");
  });

  test("after Undo, the pieces and their labels agree", async ({ page }) => {
    await open(page, { form: "Vs8 Ch8" });
    const before = await cells(page);
    await focusPiece(page, 1);
    await page.keyboard.press("ArrowDown");
    await expect.poll(() => cells(page)).not.toEqual(before);
    const moved = await cells(page);
    await page.getByRole("button", { name: "Undo" }).click();
    await expect.poll(() => cells(page)).not.toEqual(moved);
    // Every label's section has a piece under it.
    await expect.poll(() => cells(page)).toEqual(before);
  });
});
