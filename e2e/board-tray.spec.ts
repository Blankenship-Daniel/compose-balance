import { cells, drag, expect, expectSong, onPiece, open, song, test } from "./fixtures.ts";

test.describe("board: adding from the tray", () => {
  test("a shape dropped on empty sky starts a 1-bar section", async ({ page }) => {
    await open(page, { form: "Vs8 Ch8" });
    const tray = await page.getByLabel("Add a bar of bridge").boundingBox();
    const board = await page.locator("lattice-board").boundingBox();
    await drag(page, { x: tray!.x + 15, y: tray!.y + 15 }, { x: board!.x + 120, y: board!.y + board!.height - 40 });
    await expectSong(page, "Vs8 Ch8 Br1");
  });

  test("a shape dropped on a section of its type adds a bar to it", async ({ page }) => {
    await open(page, { form: "Vs8 Ch8" });
    const tray = await page.getByLabel("Add a bar of chorus").boundingBox();
    await drag(page, { x: tray!.x + 15, y: tray!.y + 15 }, await onPiece(page, 1));
    await expectSong(page, "Vs8 Ch9");
  });

  test("a shape dropped off the board adds nothing", async ({ page }) => {
    await open(page, { form: "Vs8 Ch8" });
    const tray = await page.getByLabel("Add a bar of bridge").boundingBox();
    await drag(page, { x: tray!.x + 15, y: tray!.y + 15 }, { x: 640, y: 20 });
    await page.waitForTimeout(300);
    expect(await song(page)).toBe("Vs8 Ch8");
    await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled();
  });

  test("Enter on a tray shape adds a 4-bar section", async ({ page }) => {
    await open(page, { form: "Vs8 Ch8" });
    await page.getByLabel("Add a bar of outro").focus();
    await page.keyboard.press("Enter");
    await expectSong(page, "Vs8 Ch8 Out4");
  });

  test("More… shows the rarer shapes and Fewer hides them", async ({ page }) => {
    await open(page, { form: "Vs8 Ch8" });
    await expect(page.getByLabel("Add a bar of coda")).toBeHidden();
    await page.locator(".tray").getByRole("button", { name: "More…" }).click();
    await expect(page.getByLabel("Add a bar of coda")).toBeVisible();
    await page.locator(".tray").getByRole("button", { name: "Fewer" }).click();
    await expect(page.getByLabel("Add a bar of coda")).toBeHidden();
  });

  test("Tidy up lays the song out as a fresh load of it would, as one undo step", async ({ page, browser }) => {
    await open(page, { form: "Vs8 Ch8 Br8" });
    const from = await onPiece(page, 1);
    await drag(page, from, { x: from.x + 40, y: from.y + 200 });
    await expect(page.getByRole("button", { name: "Undo" })).toBeEnabled();
    const moved = await song(page);
    await page.locator(".tray").getByRole("button", { name: "Tidy up" }).click();
    expect(await song(page)).toBe(moved);
    const fresh = await browser.newPage({ viewport: page.viewportSize()! });
    await open(fresh, { form: moved });
    const tidied = await cells(page);
    expect(tidied).toEqual(await cells(fresh));
    await fresh.close();
    // Undo once: back to the hand-moved layout, same song.
    await page.getByRole("button", { name: "Undo" }).click();
    expect(await song(page)).toBe(moved);
    expect(await cells(page)).not.toEqual(tidied);
  });

  test("Alt-drag pulls one bar off a section as a section of its own", async ({ page }) => {
    await open(page, { form: "Vs8 Ch8" });
    const from = await onPiece(page, 0);
    const board = (await page.locator("lattice-board").boundingBox())!;
    await drag(page, from, { x: from.x + 40, y: board.y + board.height - 50 }, { alt: true });
    await expectSong(page, "Vs7 Ch8 Vs1");
  });

  test("an Alt-press let go where it started changes nothing", async ({ page }) => {
    await open(page, { form: "Vs8 Ch8" });
    const before = await cells(page);
    const at = await onPiece(page, 0);
    await page.keyboard.down("Alt");
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    await page.mouse.up();
    await page.keyboard.up("Alt");
    await page.waitForTimeout(600);
    expect(await song(page)).toBe("Vs8 Ch8");
    expect(await cells(page)).toEqual(before);
  });
});
