import { boardSection, expect, expectSong, open, sectionCentre, test } from "./fixtures.ts";

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

  test("narrow screens fold the tools behind a button, and keep Undo and the menu in the row", async ({ page }) => {
    test.skip(!narrow(page), "phone-width toolbar only");
    await open(page, { form: "Vs8 Ch8" });
    const era = page.getByLabel("Compare against");
    await expect(era).toBeHidden();
    await expect(page.getByRole("button", { name: "Undo" })).toBeVisible();
    await expect(page.getByRole("button", { name: "More", exact: true })).toBeVisible();
    const tools = page.getByRole("button", { name: "Tools", exact: true });
    await tools.click();
    await expect(era).toBeVisible();
    await tools.click();
    await expect(era).toBeHidden();
  });

  test("the toolbar keeps to one row; open, every tool is in view and the toolbar scrolls away", async ({ page }) => {
    test.skip(!narrow(page), "phone-width toolbar only");
    await open(page, { form: "In4 Vs8 Pre4 Ch8 Vs8 Pre4 Ch8 Br8 Ch8 Ch8 Out4" });
    const rows = () =>
      page.evaluate(() => {
        const tops = [...document.querySelectorAll(".toolbar-row > *, .toolbar-tools > *")]
          .filter((el) => (el as HTMLElement).offsetParent)
          .map((el) => {
            const r = el.getBoundingClientRect();
            return Math.round((r.top + r.bottom) / 2 / 20);
          });
        return new Set(tops).size;
      });
    expect(await rows()).toBe(1);
    await page.getByRole("button", { name: "Tools", exact: true }).click();
    for (const el of await page.locator(".toolbar-tools > :visible").all()) await expect(el).toBeInViewport({ ratio: 1 });
    expect(await page.locator(".toolbar").evaluate((el) => getComputedStyle(el).position)).not.toBe("sticky");
  });

  test("every item in the menu can be reached", async ({ page }) => {
    await open(page, { form: "In4 Vs8 Pre4 Ch8 Vs8 Pre4 Ch8 Br8 Ch8 Ch8 Out4" });
    // Scrolled down: the toolbar is stuck to the top, so the menu opens from there.
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.getByRole("button", { name: "More", exact: true }).click();
    const last = page.locator(".menu-list button").last();
    await last.scrollIntoViewIfNeeded();
    await expect(last).toBeInViewport({ ratio: 1 });
  });

  test("narrow screens show one Tidy up, in the toolbar", async ({ page }) => {
    test.skip(!narrow(page), "phone-width toolbar only");
    await open(page, { form: "Vs8 Ch8" });
    await page.getByRole("button", { name: "Tools", exact: true }).click();
    await expect(page.locator(".toolbar-tidy")).toBeVisible();
    await expect(page.locator(".tray .tidy")).toBeHidden();
  });

  test("toolbar targets are at least 44px tall for a finger", async ({ page, isMobile }) => {
    test.skip(!isMobile, "touch only");
    await open(page, { form: "Vs8 Ch8" });
    const tools = page.getByRole("button", { name: "Tools", exact: true });
    if (await tools.isVisible()) await tools.click();
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

test.describe("phone actions", () => {
  test("a picked section's actions are all in view, the rest behind ⋯", async ({ page }) => {
    test.skip(!narrow(page), "phone-width tray only");
    await open(page, { form: "In4 Vs8 Ch8 Out4" });
    await boardSection(page, 3).label.click();
    const tray = (await page.locator(".tray").boundingBox())!;
    const inTray = async (name: string) => {
      const b = (await page.locator(".section-actions").getByRole("button", { name, exact: true }).boundingBox())!;
      expect(b.x >= tray.x && b.x + b.width <= tray.x + tray.width && b.y >= tray.y && b.y + b.height <= tray.y + tray.height, name).toBe(true);
      expect(b.height, name).toBeGreaterThanOrEqual(44);
    };
    for (const name of ["Done", "One bar shorter", "One bar longer", "Turn", "Play", "Remove", "More actions"]) await inTray(name);
    await page.getByRole("button", { name: "More actions" }).click();
    for (const name of ["Glue", "Break", "Pull a bar", "Back"]) await inTray(name);
    await expect(page.locator(".section-actions").getByRole("button", { name: "Turn", exact: true })).toBeHidden();
    await expect(page.locator(".section-actions").getByRole("button", { name: "Glue", exact: true })).toBeFocused();
  });

  test("at 320px the actions keep to two rows, and the tray is over the pins", async ({ page }) => {
    test.skip(!narrow(page), "phone-width tray only");
    await page.setViewportSize({ width: 320, height: 568 });
    await open(page, { form: "In4 Vs8 Pre4 Ch7 Vs8 Pre4 Ch8 Inst4 Br8 Ch8 Out4" });
    await boardSection(page, 1).label.click();
    const rows = await page.locator(".section-actions button:visible").evaluateAll((els) => new Set(els.map((el) => Math.round(el.getBoundingClientRect().top))).size);
    expect(rows).toBe(2);
    // Whatever is under the tray's buttons, the tray takes the tap.
    for (const el of await page.locator(".section-actions button:visible").all()) {
      const b = (await el.boundingBox())!;
      const top = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest(".tray") !== null, { x: b.x + b.width / 2, y: b.y + b.height / 2 });
      expect(top, (await el.textContent()) ?? "").toBe(true);
    }
  });

  test("a mouse click on a section shows its actions at a phone's width", async ({ page, isMobile }) => {
    test.skip(!narrow(page) || isMobile, "phone width, by mouse");
    await open(page, { form: "Vs8 Ch8" });
    const at = await sectionCentre(page, 1);
    await page.mouse.click(at.x, at.y);
    await expect(page.locator(".section-actions")).toBeVisible();
  });

  test("tapping a tray shape adds a section and picks it", async ({ page }) => {
    test.skip(!narrow(page), "phone-width tray only");
    await open(page, { form: "Vs8 Ch8" });
    await page.getByLabel("Add a bar of bridge").click();
    await expectSong(page, "Vs8 Ch8 Br4");
    await expect(page.locator(".section-actions")).toHaveAttribute("aria-label", /Bridge, 4 bars/);
  });

  test("Done lets go: the actions and the piece's focus", async ({ page }) => {
    test.skip(!narrow(page), "phone-width tray only");
    await open(page, { form: "Vs8 Ch8" });
    const at = await sectionCentre(page, 1);
    await page.mouse.click(at.x, at.y);
    await page.getByRole("button", { name: "Done" }).click();
    await expect(page.locator(".section-actions")).toBeHidden();
    expect(await page.evaluate(() => document.querySelector("lattice-board")!.shadowRoot!.activeElement)).toBeNull();
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
    const label = (await page.locator(".overlay .section-marks").nth(i).locator(".section-label").boundingBox())!;
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
