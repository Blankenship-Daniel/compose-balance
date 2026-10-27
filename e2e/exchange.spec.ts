import { expect, expectSong, hash, menu, open, test } from "./fixtures.ts";

const fixture = (name: string) => new URL(`../src/core/__tests__/fixtures/${name}`, import.meta.url);

async function openExchange(page: import("@playwright/test").Page) {
  await menu(page).click();
  await page.getByRole("button", { name: "Import or export…" }).click();
  await expect(page.getByLabel("Annotation text")).toBeVisible();
}

test.describe("import and export", () => {
  test("shows the current form as annotation text", async ({ page }) => {
    await open(page, { form: "Vs8 Ch8" });
    await openExchange(page);
    await expect(page.getByLabel("Annotation text")).toHaveValue(/verse/i);
    await expect(page.getByRole("button", { name: "Import this text" })).toBeDisabled();
  });

  test("importing pasted text replaces the song", async ({ page }) => {
    await open(page, { form: "Vs8" });
    await openExchange(page);
    // The dev server serves the repo, fixtures included.
    const text = await (await page.request.get("/src/core/__tests__/fixtures/billboard-0003.txt")).text();
    await page.getByLabel("Annotation text").fill(text);
    await page.getByRole("button", { name: "Import this text" }).click();
    await expect.poll(async () => (await hash(page)).f).not.toBe("Vs8");
  });

  test("Open file… imports a file", async ({ page }) => {
    await open(page, { form: "Vs8" });
    await openExchange(page);
    await page.locator('.file-button input[type="file"]').setInputFiles(fixture("salami-10-textfile1.txt").pathname);
    await expect.poll(async () => (await hash(page)).f).not.toBe("Vs8");
  });

  test("an import is one undo step", async ({ page }) => {
    await open(page, { form: "Vs8" });
    await openExchange(page);
    await page.locator('.file-button input[type="file"]').setInputFiles(fixture("salami-10-textfile1.txt").pathname);
    await expect.poll(async () => (await hash(page)).f).not.toBe("Vs8");
    await page.getByRole("button", { name: "Close" }).click();
    await page.getByRole("button", { name: "Undo" }).click();
    await expectSong(page, "Vs8");
  });

  test("text that isn't an annotation says so and changes nothing", async ({ page }) => {
    await open(page, { form: "Vs8 Ch8" });
    await openExchange(page);
    await page.getByLabel("Annotation text").fill("hello world");
    await page.getByRole("button", { name: "Import this text" }).click();
    await expect(page.locator("ul.import-notes li")).not.toHaveCount(0);
    await expectSong(page, "Vs8 Ch8");
  });

  test("Copy puts the export on the clipboard", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await open(page, { form: "Vs8 Ch8" });
    await openExchange(page);
    await page.getByRole("button", { name: "Copy" }).click();
    await expect(page.getByRole("button", { name: "Copied" })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(await page.getByLabel("Annotation text").inputValue());
  });

  test("Download saves form.salami.txt", async ({ page }) => {
    await open(page, { form: "Vs8 Ch8" });
    await openExchange(page);
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download .txt" }).click();
    expect((await download).suggestedFilename()).toBe("form.salami.txt");
  });

  test("Show current form drops the edited text", async ({ page }) => {
    await open(page, { form: "Vs8 Ch8" });
    await openExchange(page);
    const area = page.getByLabel("Annotation text");
    const live = await area.inputValue();
    await area.fill("draft");
    await page.getByRole("button", { name: "Show current form" }).click();
    await expect(area).toHaveValue(live);
  });
});
