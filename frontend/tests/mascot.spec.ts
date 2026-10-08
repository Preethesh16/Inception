import { expect } from "@playwright/test";
import { test } from "./fixtures";

test("Pip flies in, docks, introduces the product, and its bubble can be reopened", async ({
  page,
}) => {
  await page.goto("/");
  const mascot = page.locator(".care-mascot");
  await expect(mascot).toHaveClass(/is-flying/);
  await expect(page.locator(".mascot-model canvas")).toBeVisible();
  await expect(page.locator(".mascot-intro")).toHaveCount(0);
  await expect(mascot).toHaveClass(/is-landed/, { timeout: 10000 });
  await expect(
    page.getByRole("heading", { name: "Hi, I’m Pip!" }),
  ).toBeVisible();
  await expect(page.locator(".mascot-intro")).toContainText(
    "forecast supply needs",
  );
  const assertInViewport = async () => {
    for (const locator of [mascot, page.locator(".mascot-intro")]) {
      const box = await locator.boundingBox();
      const viewport = page.viewportSize()!;
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
      expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
    }
  };
  await assertInViewport();
  await page.mouse.wheel(0, 600);
  await assertInViewport();
  await page
    .getByRole("heading", { name: "One network. Better prepared." })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "../artifacts/pip-desktop.png",
    fullPage: false,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await assertInViewport();
  await page.screenshot({
    path: "../artifacts/pip-mobile.png",
    fullPage: false,
  });
  await page.getByRole("button", { name: "Close introduction" }).click();
  await expect(mascot).toBeVisible();
  await expect(page.locator(".mascot-intro")).toHaveCount(0);
  await expect(page.getByText("Meet Pip", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Open Pip introduction" }).click();
  await expect(page.locator(".mascot-intro")).toBeVisible();
});

test("reduced motion docks immediately and the welcome link opens hospital login", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator(".care-mascot")).toHaveClass(/is-landed/);
  await page.getByRole("link", { name: /Let’s meet your hospital/ }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Sign in to your hospital" })).toBeVisible();
  await expect(page.locator(".mascot-intro")).toContainText("Enter your hospital’s email");
  await page.getByRole("button", { name: "Close introduction" }).click();
  await expect(page.locator(".mascot-intro")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Open Pip introduction", exact: true })
    .focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".mascot-intro")).toBeVisible();
});
