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
  await expect(page.locator(".hero-capabilities")).toHaveCount(0);
  const network = page.locator(".hospital-network");
  const initial = await network.getAttribute("data-active-hospital");
  const sequence = ["A", "B", "D"];
  const start = sequence.indexOf(initial!);
  for (let step = 1; step <= 3; step++) {
    await expect(network).toHaveAttribute(
      "data-active-hospital",
      sequence[(start + step) % 3],
      { timeout: 3500 },
    );
  }
  await expect(page.getByText("MYSURU CARE NETWORK")).toHaveCount(0);
  await expect(page.locator(".network-facilities")).toHaveCount(0);
  await expect(page.locator(".hospital-network")).toHaveCSS(
    "background-color",
    "rgba(0, 0, 0, 0)",
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
  await page.getByRole("link", { name: "Enter your hospital" }).click();
  await expect(
    page.getByRole("heading", { name: "Sign in to your hospital" }),
  ).toBeVisible();
});

test("Enter your hospital navigates to the login popup with Pip", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Enter your hospital" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.locator(".network-hero")).toHaveCount(1);
  await expect(
    page.getByRole("heading", { name: "Sign in to your hospital" }),
  ).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
  await expect(page.locator(".care-mascot")).toHaveClass(/is-landed/);
  await expect(page.locator(".mascot-intro")).toContainText(
    "Enter your hospital’s email and password",
  );
  await page.screenshot({
    path: "../artifacts/pip-login.png",
    fullPage: false,
  });
  await page.getByRole("button", { name: "Close sign in" }).click();
  await expect(page).toHaveURL(/\/$/);
});

test("dedicated login preserves hospital identity and approval destination", async ({
  page,
}) => {
  await page.goto("/login?login=D&tab=approvals");
  await expect(page.getByLabel("Email", { exact: true })).toHaveValue(
    "admin@mandya.demo",
  );
  await page.getByLabel("Password", { exact: true }).fill("Demo@2026");
  await page.getByRole("button", { name: "Show characters" }).click();
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute(
    "type",
    "text",
  );
  await expect(page.locator(".mascot-model canvas")).toBeVisible();
  await page.getByRole("button", { name: "Hide characters" }).click();
  await page.screenshot({
    path: "../artifacts/pip-login.png",
    fullPage: false,
  });
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page).toHaveURL(/\/hospital\/D\?tab=approvals$/);
});

test("login keeps Pip fixed in the bottom right", async ({ page }) => {
  await page.goto("/login");
  await expect(page.locator(".login-character-panel")).toHaveCount(0);
  await expect(page.locator(".care-mascot")).toHaveCSS("position", "fixed");
  await expect(page.locator(".mascot-intro")).toContainText(
    "Enter your hospital’s email",
  );
  await page.getByRole("button", { name: "Close introduction" }).click();
  await expect(page.locator(".mascot-model canvas")).toBeVisible();
  await page.getByRole("button", { name: "Open Pip introduction" }).click();
  await expect(page.locator(".mascot-intro")).toBeVisible();
});
