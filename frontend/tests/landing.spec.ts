import { expect } from "@playwright/test";
import { test } from "./fixtures";

test("WebGL scene is frameless without animation controls", async ({
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
    .locator(".trio-hospital-options button")
    .filter({ hasText: "Mandya" })
    .click();
  await expect(page.getByText("MYSURU CARE NETWORK")).toHaveCount(0);
  await expect(page.locator(".network-facilities")).toHaveCount(0);
  await expect(page.locator(".hospital-network")).toHaveCSS(
    "background-color",
    "rgba(0, 0, 0, 0)",
  );
  await expect(page.locator(".trio-hospital-options .selected")).toContainText(
    "Mandya",
  );
  await expect(
    page.getByRole("button", { name: /(?:Pause|Play).*animation/ }),
  ).toHaveCount(0);
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
    .locator(".trio-hospital-options button")
    .filter({ hasText: "Chamundi" })
    .click();
  await expect(page.locator(".trio-hospital-options .selected")).toContainText(
    "Chamundi",
  );
});
