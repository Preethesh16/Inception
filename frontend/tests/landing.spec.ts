import { expect } from "@playwright/test";
import { test } from "./fixtures";

test("WebGL network selects a hospital and supports paused animation", async ({
  page,
}) => {
  await page.goto("/");
  const canvas = page.locator(".network-canvas canvas");
  await expect(canvas).toBeVisible();
  await expect
    .poll(() =>
      canvas.evaluate((node: HTMLCanvasElement) =>
        Boolean(node.getContext("webgl2")),
      ),
    )
    .toBe(true);
  await page
    .locator(".network-facilities button")
    .filter({ hasText: "Mandya" })
    .click();
  await expect(
    page.locator(".network-facilities button").filter({ hasText: "Mandya" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".trio-hospital-options .selected")).toContainText(
    "Mandya",
  );
  await page.getByRole("button", { name: "Pause network animation" }).click();
  await expect(
    page.getByRole("button", { name: "Play network animation" }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.screenshot({
    path: "../artifacts/landing-webgl-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(canvas).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "../artifacts/landing-webgl-mobile.png",
    fullPage: true,
  });
});

test("login selection remains available without WebGL", async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      kind: string,
      ...args: any[]
    ) {
      if (kind.includes("webgl")) return null;
      return (original as any).call(this, kind, ...args);
    } as typeof original;
  });
  await page.goto("/");
  await expect(
    page.getByText("Network schematic · 3D unavailable"),
  ).toBeVisible();
  await page
    .locator(".network-facilities button")
    .filter({ hasText: "Chamundi" })
    .click();
  await expect(page.locator(".trio-hospital-options .selected")).toContainText(
    "Chamundi",
  );
});
