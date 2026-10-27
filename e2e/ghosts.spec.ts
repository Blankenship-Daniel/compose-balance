import { drag, expect, expectSong, onPiece, open, pick, test } from "./fixtures.ts";

test.describe("phrase ghosts", () => {
  test("an unflagged short section shows its ghost only under the pointer", async ({ page }) => {
    await open(page, { form: "In1 Ch4 Vs3 Ch4" });
    await expect(page.locator(".ghost-group")).toHaveCount(0);
    const at = await onPiece(page, 0);
    await page.mouse.move(at.x, at.y);
    const ghost = page.locator(".ghost-group");
    await expect(ghost).toHaveCount(1);
    await expect(ghost.locator(".ghost-label")).toHaveText("+3");
    await page.mouse.move(5, 5);
    await expect(page.locator(".ghost-group")).toHaveCount(0);
  });

  test("picking a short section shows its ghost", async ({ page }) => {
    await open(page, { form: "In1 Ch4 Vs3 Ch4" });
    await pick(page, 2);
    await page.mouse.move(5, 5);
    await expect(page.locator(".ghost-group .ghost-label")).toHaveText("+1");
  });

  test("a flagged short section always shows its ghost", async ({ page }) => {
    await open(page, { form: "Vs8 Ch8 Vs8 Ch7 Ch8" });
    await page.mouse.move(5, 5);
    await expect(page.locator(".ghost-group.flag-warning")).toHaveCount(1);
  });

  test("clicking a ghost finishes the phrase", async ({ page }) => {
    await open(page, { form: "In1 Ch4 Vs3 Ch4" });
    const at = await onPiece(page, 0);
    await page.mouse.move(at.x, at.y);
    const ghost = page.locator(".ghost-group .ghost").first();
    const box = (await ghost.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expectSong(page, "In4 Ch4 Vs3 Ch4");
  });

  test("no ghost while a piece is carried", async ({ page }) => {
    await open(page, { form: "Vs8 Ch8 Vs8 Ch7 Ch8" });
    await expect(page.locator(".ghost-group")).toHaveCount(1);
    const at = await onPiece(page, 0);
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    await page.mouse.move(at.x + 10, at.y + 30, { steps: 4 });
    await expect(page.locator(".ghost-group")).toHaveCount(0);
    await page.mouse.up();
    void drag;
  });
});
