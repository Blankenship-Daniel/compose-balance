import { boardSection, expect, expectSong, open, song, test, toolbarButton } from "./fixtures.ts";

/** Where strokes can start: inside the shears pad, which covers the table. */
async function inPad(page: import("@playwright/test").Page, p: { x: number; y: number }) {
  const pad = (await page.locator("shears-pad").boundingBox())!;
  return { x: Math.max(pad.x + 4, p.x), y: Math.max(pad.y + 4, p.y) };
}

/** A straight stroke, in small steps. */
async function stroke(page: import("@playwright/test").Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let k = 1; k <= 16; k++) await page.mouse.move(from.x + ((to.x - from.x) * k) / 16, from.y + ((to.y - from.y) * k) / 16);
  await page.mouse.up();
}

test.describe("shears", () => {
  test("a stroke clean through a section takes a bar off it, and Shears turns off", async ({ page }) => {
    await open(page, { form: "Vs8 Ch4 Br8" });
    const shears = await toolbarButton(page, "Shears");
    await shears.click();
    const box = (await boardSection(page, 1).outline.boundingBox())!;
    const x = box.x + box.width / 2;
    await stroke(page, await inPad(page, { x, y: box.y - 25 }), { x, y: box.y + box.height + 25 });
    await expectSong(page, "Vs8 Ch3 Br8");
    await expect(page.locator(".shears-toggle")).toHaveAttribute("aria-pressed", "false");
  });

  test("a stroke across two sections takes a bar off each", async ({ page }) => {
    await open(page, { form: "Ch4 Ch4" });
    await (await toolbarButton(page, "Shears")).click();
    const a = (await boardSection(page, 0).outline.boundingBox())!;
    const b = (await boardSection(page, 1).outline.boundingBox())!;
    test.skip(Math.abs(a.y - b.y) > 2, "the two sections wrap onto separate rows at this width");
    const y = a.y + a.height / 2;
    await stroke(page, await inPad(page, { x: a.x - 25, y }), { x: b.x + b.width + 25, y });
    await expectSong(page, "Ch3 Ch3");
  });

  test("a stroke that stays inside a section cuts nothing", async ({ page }) => {
    await open(page, { form: "Vs8 Ch8" });
    await (await toolbarButton(page, "Shears")).click();
    const box = (await boardSection(page, 1).outline.boundingBox())!;
    // A short stroke inside one block: it crosses no block clean through.
    await stroke(page, { x: box.x + box.width * 0.12, y: box.y + box.height * 0.3 }, { x: box.x + box.width * 0.16, y: box.y + box.height * 0.3 });
    await page.waitForTimeout(200);
    expect(await song(page)).toBe("Vs8 Ch8");
  });

  test("a 1-bar section cut through is removed", async ({ page }) => {
    await open(page, { form: "Vs8 Ch1" });
    await (await toolbarButton(page, "Shears")).click();
    const box = (await boardSection(page, 1).outline.boundingBox())!;
    const x = box.x + box.width / 2;
    await stroke(page, await inPad(page, { x, y: box.y - 25 }), { x, y: box.y + box.height + 25 });
    await expectSong(page, "Vs8");
  });

  test("Escape puts the shears away", async ({ page }) => {
    await open(page, { form: "Vs8 Ch8" });
    const shears = await toolbarButton(page, "Shears");
    await shears.click();
    await expect(page.locator("shears-pad")).toBeAttached();
    await page.keyboard.press("Escape");
    await expect(page.locator(".shears-toggle")).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator("shears-pad")).toHaveCount(0);
  });
});

test("a stroke started just above the first row still cuts", async ({ page }) => {
  await open(page, { form: "Vs8 Ch4 Br8" });
  await (await toolbarButton(page, "Shears")).click();
  const box = (await boardSection(page, 1).outline.boundingBox())!;
  const x = box.x + box.width / 2;
  // 30px above the row: between the toolbar and the board, where a person starts a cut.
  await stroke(page, { x, y: box.y - 30 }, { x, y: box.y + box.height + 25 });
  await expectSong(page, "Vs8 Ch3 Br8");
});

test("the shears pad covers no toolbar control and adds no sideways scroll", async ({ page }) => {
  await open(page, { form: "In4 Vs8 Pre4 Ch8 Vs8 Pre4 Ch8 Br8 Ch8 Ch8 Out4" });
  await (await toolbarButton(page, "Shears")).click();
  const pad = (await page.locator("shears-pad").boundingBox())!;
  for (const el of await page.locator(".toolbar button:visible, .toolbar input:visible, .toolbar select:visible").all()) {
    const b = (await el.boundingBox())!;
    expect(b.y + b.height <= pad.y || b.y >= pad.y + pad.height, `${await el.getAttribute("class")} under the pad`).toBe(true);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
});
