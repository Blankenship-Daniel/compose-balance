import { boardSection, expect, open, test } from "./fixtures.ts";

const playing = (page: import("@playwright/test").Page) => page.locator("button.play");

test.describe("playback", () => {
  test("plays bar by bar and stops by itself at the end", async ({ page }) => {
    // 400 bpm: a bar every 0.6 s, so 4 bars are over in under 3 s.
    await open(page, { form: "Ch4", bpm: 400 });
    await playing(page).click();
    await expect(playing(page)).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".bar-lit")).toBeAttached();
    await expect(playing(page)).toHaveAttribute("aria-pressed", "false", { timeout: 6000 });
    await expect(page.locator(".bar-lit")).toHaveCount(0);
  });

  test("the elapsed time counts up while playing", async ({ page }) => {
    await open(page, { form: "Vs8 Ch8", bpm: 240 });
    await playing(page).click();
    await expect(page.locator(".duration")).toContainText("0:00 /");
    await expect(page.locator(".duration")).toContainText(/0:0[2-9] \//, { timeout: 5000 });
  });

  for (const [what, act] of [
    ["an edit", async (page: import("@playwright/test").Page) => {
      await boardSection(page, 1).label.focus();
      await page.keyboard.press("+");
    }],
    ["Undo", async (page: import("@playwright/test").Page) => {
      await page.getByRole("button", { name: "Undo" }).click();
    }],
    ["a tempo change", async (page: import("@playwright/test").Page) => {
      await page.getByLabel(/Tempo in/).fill("90");
    }],
  ] as const)
    test(`stops on ${what}`, async ({ page }) => {
      await open(page, { form: "Vs8 Ch8", bpm: 60 });
      // Something to undo first.
      await boardSection(page, 0).label.focus();
      await page.keyboard.press("+");
      await playing(page).click();
      await expect(playing(page)).toHaveAttribute("aria-pressed", "true");
      await act(page);
      await expect(playing(page)).toHaveAttribute("aria-pressed", "false");
    });

  test("keeps playing through a view switch, lighting the chart's bar", async ({ page }) => {
    await open(page, { form: "Vs8 Ch8", bpm: 60 });
    await playing(page).click();
    await page.getByRole("button", { name: "Chart", exact: true }).click();
    await expect(page.locator(".bar.is-playing")).toHaveCount(1);
  });

  test("Enter on a section label plays from that section", async ({ page }) => {
    await open(page, { form: "Vs8 Ch8", bpm: 60, view: "chart" });
    await page.getByRole("button", { name: "Table", exact: true }).click();
    await boardSection(page, 1).label.focus();
    await page.keyboard.press("Enter");
    await page.getByRole("button", { name: "Chart", exact: true }).click();
    await expect(page.locator(".bar.is-playing")).toHaveAttribute("aria-label", /Play from bar 9,/);
  });
});
