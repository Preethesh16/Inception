import { readFileSync } from "node:fs";
import { expect } from "@playwright/test";
import { test } from "./fixtures";

test("CSV animation follows validation, rejection and confirmed import", async ({
  page,
  request,
}) => {
  await request.post("/api/demo/onboarding-reset", {
    headers: { "X-Demo-Session": "demo-judge" },
  });
  await page.goto("/login?login=A");
  await page.getByLabel("Password", { exact: true }).fill("Demo@2026");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  const uploader = page.locator(".csv-upload");
  await expect(uploader).toHaveClass(/is-idle/);
  await expect(page.locator(".mascot-intro")).toContainText(
    "Let’s connect your hospital.",
  );
  await page.getByRole("button", { name: "Dismiss Pip explanation" }).click();
  await expect(page.locator(".mascot-intro")).toHaveCount(0);
  await page.getByRole("button", { name: "Show Pip explanation" }).click();
  await expect(
    page.getByRole("heading", { name: "Nearby hospitals" }),
  ).toBeVisible();
  await expect(page.locator(".nearby-facilities > div")).toHaveCount(3);
  await expect(
    page.locator(".nearby-facilities > div").filter({ hasText: "Kaveri" }),
  ).toContainText("Awaiting forecast");
  await expect(page.getByLabel("Hospital risk legend")).toContainText(
    "High shortage risk",
  );
  await page.getByLabel("Hospital CSV").setInputFiles({
    name: "wrong.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("no"),
  });
  await expect(page.getByRole("alert")).toContainText("Please choose a .csv");
  await page.getByLabel("Hospital CSV").setInputFiles({
    name: "invalid.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("wrong,headers\n1,2"),
  });
  await page
    .getByRole("button", { name: "Import hospital", exact: true })
    .click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(uploader).not.toHaveClass(/is-complete/);
  const csv = readFileSync(
    "../demo-data/three-hospital/A-hospital.csv",
    "utf8",
  );
  await uploader.evaluate((element, text) => {
    const transfer = new DataTransfer();
    transfer.items.add(
      new File([text], "A-hospital.csv", { type: "text/csv" }),
    );
    element.dispatchEvent(
      new DragEvent("drop", {
        bubbles: true,
        cancelable: true,
        dataTransfer: transfer,
      }),
    );
  }, csv);
  await expect(uploader).toHaveClass(/is-ready/);
  await expect(page.getByRole("alert")).toHaveCount(0);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/onboarding/csv", async (route) => {
    await gate;
    await route.fallback();
  });
  const startedAt = Date.now();
  try {
    await page
      .getByRole("button", { name: "Import hospital", exact: true })
      .click();
    await expect(uploader).toHaveClass(/is-uploading/);
    await expect(page.locator(".mascot-intro")).toContainText(
      "Your file is being connected.",
    );
    await expect(page.getByLabel("Hospital CSV")).toBeDisabled();
    await expect(
      page.getByText("Import successful", { exact: true }),
    ).toHaveCount(0);
    await page.screenshot({
      path: "../artifacts/csv-uploading.png",
      fullPage: true,
    });
  } finally {
    release();
  }
  await expect(uploader).toHaveClass(/is-complete/);
  expect(Date.now() - startedAt).toBeGreaterThanOrEqual(3500);
  await expect(
    page.getByText("Hospital data connected", { exact: true }),
  ).toBeVisible();
  await expect(uploader).toContainText("consumption records connected");
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page.locator(".mascot-intro")).toContainText(
    "Your inventory is connected!",
  );
  await page.locator(".nearby-facilities").scrollIntoViewIfNeeded();
  await expect(page.locator(".mascot-intro")).toContainText(
    "Here’s your hospital network.",
  );
  await expect(page.locator(".mascot-intro")).toContainText(
    "Mandya Regional Hospital",
  );
  await page.getByRole("button", { name: "Dismiss Pip explanation" }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page.locator(".mascot-intro")).toHaveCount(0);
  await page.getByRole("button", { name: "Show Pip explanation" }).click();
  await expect(page.locator(".mascot-intro")).toContainText(
    "Your inventory is connected!",
  );
  await page.screenshot({
    path: "../artifacts/csv-imported.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Report outbreak", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Report demand surge" });
  await expect(dialog.getByRole("combobox")).toHaveCount(1);
  await expect(dialog.locator("input, textarea")).toHaveCount(0);
  await expect(dialog.locator(".mascot-intro")).toContainText(
    "Choose the product",
  );
  await dialog.getByRole("button", { name: "Dismiss Pip explanation" }).click();
  await expect(dialog.locator(".mascot-intro")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Show Pip explanation" }).click();
  await dialog.getByLabel("Product", { exact: true }).selectOption("ORS");
  const reportRequest = page.waitForRequest(
    (r) => r.url().includes("/api/outbreak-reports") && r.method() === "POST",
  );
  await dialog
    .getByRole("button", { name: "Report demand surge", exact: true })
    .click();
  expect((await reportRequest).postDataJSON()).toMatchObject({
    supply_ids: ["ORS"],
    additional_units: {},
    category: "Suspected demand surge",
  });
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Past usage", exact: true }).click();
  await expect(page.getByLabel("Usage product")).toBeVisible();
  await page.getByLabel("Usage product").selectOption("ORS");
  await page.getByRole("button", { name: "7 days", exact: true }).click();
  const bars = page.locator(".usage-bar");
  await expect(bars.first()).toBeVisible();
  expect(await bars.count()).toBeLessThanOrEqual(7);
  await expect(
    page.locator(".usage-bar.is-above-average").first(),
  ).toHaveAttribute("aria-label", /above period average/);
  await expect(
    page.locator(".usage-bar:not(.is-above-average)").first(),
  ).toHaveAttribute("aria-label", /at or below period average/);
  await expect(
    page.getByText("View source records", { exact: false }),
  ).toHaveCount(0);
  await bars.first().focus();
  await expect(bars.first()).toHaveAttribute("aria-pressed", "true");
  const label = await bars.first().getAttribute("aria-label");
  await expect(page.locator(".mascot-intro")).toContainText(
    label!.split(":")[0],
  );
  await expect(page.locator(".mascot-intro")).toContainText("consumed");
  await page.getByRole("button", { name: "7 days", exact: true }).click();
  await expect(page.locator(".mascot-intro")).toContainText("last 7 days");
  await page.getByLabel("Usage product").selectOption("MSK");
  await expect(page.locator(".mascot-intro")).toContainText("Surgical masks");
  await page.screenshot({
    path: "../artifacts/usage-explorer.png",
    fullPage: true,
  });
  await page.getByLabel("Audit product").scrollIntoViewIfNeeded();
  await page.getByLabel("Audit product").selectOption("ORS");
  const event = page.locator(".audit-event").first();
  await event.click();
  await expect(event).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".mascot-intro")).toContainText(
    "added to on-hand inventory",
  );
  await expect(page.locator(".mascot-intro")).toContainText(
    "Validated onboarding CSV",
  );
  await page.locator(".audit-event").nth(1).click();
  await expect(page.locator(".audit-event").nth(1)).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator(".audit-flow, .audit-detail")).toHaveCount(0);
  await page.getByLabel("Audit product").selectOption("MSK");
  await expect(page.locator(".mascot-intro")).toContainText("Surgical masks");
  await page.screenshot({
    path: "../artifacts/inventory-journey.png",
    fullPage: false,
  });
  await page
    .getByRole("button", { name: "Inventory management", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Expiry watch" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Within 7 days/ }).click();
  await expect(page.locator(".expiry-shelf")).toContainText(
    "No stocked batches",
  );
  await page.getByRole("button", { name: /All upcoming/ }).click();
  await page.locator(".expiry-tile").first().click();
  await expect(page.locator(".mascot-intro")).toContainText(
    "Near expiry does not automatically mean waste",
  );
  await page.getByLabel("Inventory product").selectOption("ORS");
  await page.getByLabel("Find inventory batch").fill("A-ORS-01");
  await expect(page.locator(".inventory-bar-row")).toHaveCount(1);
  await page.locator(".stock-bar-select").click();
  await expect(page.locator(".stock-bar-select")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator(".mascot-intro")).toContainText("LOT-A-ORS-01");
  await page
    .getByRole("button", { name: "Edit A-ORS-01", exact: true })
    .click();
  const edit = page.getByRole("dialog", { name: "Edit inventory batch" });
  const snapshot = await (
    await request.get("/api/snapshot", {
      headers: { "X-Demo-Session": "demo-A" },
    })
  ).json();
  const expiry = new Date(Date.parse(snapshot.demo.as_of) + 3 * 86400000)
    .toISOString()
    .slice(0, 10);
  await edit.getByLabel("Expiry date").fill(expiry);
  await edit.getByLabel("On-hand quantity").fill("20");
  await edit.getByRole("button", { name: "Save & reassess" }).click();
  await expect(edit).toHaveCount(0);
  await page.getByRole("button", { name: /Within 7 days/ }).click();
  await expect(page.locator(".expiry-tile")).toHaveCount(1);
  await expect(page.locator(".expiry-tile")).toContainText("3 days left");
  await expect(page.locator(".expiry-tile")).toContainText("20 sachet");
  await page.screenshot({
    path: "../artifacts/inventory-management.png",
    fullPage: true,
  });
});
