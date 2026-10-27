import { expect, expectSong, open, test } from "./fixtures.ts";

const narrow = (page: import("@playwright/test").Page) => (page.viewportSize()?.width ?? 1280) <= 640;

test.describe("layout at every width", () => {
  test("no sideways scroll", async ({ page }) => {
    await open(page, { form: "In4 Vs8 Pre4 Ch8 Vs8 Pre4 Ch8 Br8 Ch8 Ch8 Out4" });
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(over).toBeLessThanOrEqual(0);
  });

  test("no sideways scroll in the chart", async ({ page }) => {
    await open(page, { form: "In4 Vs8 Pre4 Ch8 Vs8 Pre4 Ch8 Br8 Ch8 Ch8 Out4", view: "chart" });
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(over).toBeLessThanOrEqual(0);
  });

  test("narrow screens fold the settings behind a button", async ({ page }) => {
    test.skip(!narrow(page), "phone-width toolbar only");
    await open(page, { form: "Vs8 Ch8" });
    const era = page.getByLabel("Compare against");
    await expect(era).toBeHidden();
    await page.getByRole("button", { name: "Settings" }).click();
    await expect(era).toBeVisible();
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await expect(era).toBeHidden();
  });

  test("narrow screens show one Tidy up, in the toolbar", async ({ page }) => {
    test.skip(!narrow(page), "phone-width toolbar only");
    await open(page, { form: "Vs8 Ch8" });
    await page.getByRole("button", { name: "Settings" }).click();
    await expect(page.locator(".toolbar-tidy")).toBeVisible();
    await expect(page.locator(".tray .tidy")).toBeHidden();
  });

  test("toolbar targets are at least 44px tall on narrow screens", async ({ page }) => {
    test.skip(!narrow(page), "phone-width toolbar only");
    await open(page, { form: "Vs8 Ch8" });
    await page.getByRole("button", { name: "Settings" }).click();
    // The tempo's target is its whole label (a tap there focuses the field), not the bare input.
    for (const el of await page.locator(".toolbar button:visible, .toolbar .tempo, .toolbar input.meter:visible, .toolbar select:visible").all()) {
      const box = await el.boundingBox();
      expect(box!.height, (await el.getAttribute("class")) ?? (await el.textContent()) ?? "").toBeGreaterThanOrEqual(44);
    }
  });

  test("every tray shape is reachable", async ({ page }) => {
    await open(page, { form: "Vs8 Ch8" });
    for (const role of ["intro", "verse", "pre-chorus", "chorus", "bridge", "outro"]) {
      const shape = page.getByLabel(`Add a bar of ${role}`);
      await shape.scrollIntoViewIfNeeded();
      await expect(shape).toBeInViewport();
    }
  });

  test("the board's pieces and labels stay inside the board", async ({ page }) => {
    await open(page, { form: "In4 Vs8 Pre4 Ch8 Vs8 Pre4 Ch8 Br8 Ch8 Ch8 Out4" });
    // Once laid out for this width (the first frame is laid out before the width is known).
    const overflow = () =>
      page.evaluate(() => {
        const t = document.querySelector(".table")!.getBoundingClientRect();
        return [...document.querySelectorAll(".section-outline")].some((o) => {
          const b = o.getBoundingClientRect();
          return b.left < t.left - 2 || b.right > t.right + 2;
        });
      });
    await expect.poll(overflow).toBe(false);
  });
});

test.describe("touch", () => {
  test("tapping a piece picks it; tapping the sky lets go", async ({ page, isMobile }) => {
    test.skip(!isMobile, "touch only");
    await open(page, { form: "Vs8 Ch8" });
    const o = (await page.locator(".section-outline").nth(1).boundingBox())!;
    await page.touchscreen.tap(o.x + o.width / 2, o.y + o.height * 0.6);
    await expect(page.locator(".section-actions")).toBeVisible();
    await expect(page.locator(".section-actions-name")).toHaveText("Chorus, 8 bars");
    const board = (await page.locator("lattice-board").boundingBox())!;
    await page.touchscreen.tap(board.x + board.width - 10, board.y + board.height - 10);
    await expect(page.locator(".section-actions")).toBeHidden();
  });

  test("a picked section's ghost shows without hover", async ({ page, isMobile }) => {
    test.skip(!isMobile, "touch only");
    await open(page, { form: "In1 Ch4" });
    const o = (await page.locator(".section-outline").nth(0).boundingBox())!;
    await page.touchscreen.tap(o.x + o.width * 0.3, o.y + o.height * 0.5);
    await expect(page.locator(".ghost-group .ghost-label")).toHaveText("+3");
    const g = (await page.locator(".ghost-group .ghost").first().boundingBox())!;
    await page.touchscreen.tap(g.x + g.width / 2, g.y + g.height / 2);
    await expectSong(page, "In4 Ch4");
  });
});

test("section labels don't sit on another section's pieces", async ({ page }) => {
  await open(page, { form: "In4 Vs8 Pre4 Ch7 Vs8 Pre4 Ch8 Inst4 Br8 Ch8 Out4" });
  const n = await page.locator(".overlay .section-marks").count();
  for (let i = 0; i < n; i++) {
    const label = (await page.locator(`text#section-${i}`).boundingBox())!;
    // The label's middle: no other section's piece under it.
    const under = await page.evaluate(
      ({ x, y }) => document.querySelector("lattice-board")!.shadowRoot!.elementsFromPoint(x, y).some((el) => el.closest(".piece")),
      { x: label.x + label.width / 2, y: label.y + label.height / 2 },
    );
    expect(under, `label ${i + 1} is over a piece`).toBe(false);
  }
});

test("no note pin covers a section label", async ({ page }) => {
  await open(page, { form: "In4 Vs8 Pre4 Ch7 Vs8 Pre4 Ch8 Inst4 Br8 Ch8 Out4" });
  // Once laid out for this width (the first frame is laid out before the width is known).
  const covered = () =>
    page.evaluate(() => {
      const labels = [...document.querySelectorAll("text[id^=section-]")].map((l) => l.getBoundingClientRect());
      return [...document.querySelectorAll("button.pin")].flatMap((pin) => {
        const p = pin.getBoundingClientRect();
        return labels.flatMap((l, i) => (p.left < l.right && l.left < p.right && p.top < l.bottom && l.top < p.bottom ? [i + 1] : []));
      });
    });
  await expect.poll(covered).toEqual([]);
});
