import { readFileSync } from "node:fs";
import { expect, type Page } from "@playwright/test";
import { test } from "./fixtures";
const headers = { "X-Demo-Session": "demo-judge" };
async function waitAnalysis(request: any, count = 9) {
  await expect
    .poll(
      async () => {
        const s = await (
          await request.get("/api/snapshot", { headers })
        ).json();
        return (
          s.forecasts.length === count &&
          !s.jobs.some((j: any) => ["queued", "running"].includes(j.status))
        );
      },
      { timeout: 240000 },
    )
    .toBe(true);
  return (await request.get("/api/snapshot", { headers })).json();
}
async function login(page: Page, id: string) {
  await page.goto("/");
  const names: Record<string, string> = {
    A: "Kaveri General",
    B: "Chamundi Community",
    D: "Mandya Regional",
  };
  await page
    .locator(".trio-hospital-options button")
    .filter({ hasText: names[id] })
    .click();
  await page.getByLabel("Password").fill("Demo@2026");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your hospital. Your supplies." }),
  ).toBeVisible();
}
test("single CSV, live stock edits, outbreak rerouting, dual approval and receipt", async ({
  page,
  context,
  request,
}) => {
  test.setTimeout(300000);
  await request.post("/api/demo/onboarding-reset", { headers });
  await waitAnalysis(request, 6);
  await page.goto("/");
  await page.screenshot({
    path: "../artifacts/trio-landing.png",
    fullPage: true,
  });
  await login(page, "A");
  await expect(page.getByText("Start with your hospital CSV")).toBeVisible();
  await page
    .getByLabel("Hospital CSV")
    .setInputFiles("../demo-data/three-hospital/A-hospital.csv");
  await page
    .getByRole("button", { name: "Import hospital", exact: true })
    .click();
  await expect(page.getByText("Hospital data connected")).toBeVisible();
  await waitAnalysis(request);
  await page
    .getByRole("button", { name: "Inventory management", exact: true })
    .click();
  for (const id of ["A-ORS-01", "A-ORS-02"]) {
    await page.getByRole("button", { name: "Edit " + id, exact: true }).click();
    await page.getByLabel("On-hand quantity").fill("10");
    await page.getByRole("button", { name: "Save & reassess" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
  let s = await waitAnalysis(request);
  expect(
    s.negotiations.some(
      (n: any) =>
        n.status === "Awaiting approvals" &&
        n.donor === "B" &&
        n.recipient === "A" &&
        n.supply_id === "ORS",
    ),
  ).toBeTruthy();
  const nearby = await context.newPage();
  await login(nearby, "B");
  for (const p of [page, nearby]) {
    await p
      .getByRole("button", { name: "Report outbreak", exact: true })
      .click();
    await p.getByLabel("Additional ORS units").fill("140");
    await p
      .getByLabel("Operational observations")
      .fill("Nearby operational outbreak signal for the demo.");
    await p.getByRole("button", { name: "Submit report & reassess" }).click();
    await expect(p.getByRole("dialog")).toHaveCount(0);
  }
  s = await waitAnalysis(request);
  const n = s.negotiations.find(
    (n: any) =>
      n.status === "Awaiting approvals" &&
      n.donor === "D" &&
      n.recipient === "A" &&
      n.supply_id === "ORS",
  );
  expect(n).toBeTruthy();
  expect(
    s.negotiations.some(
      (n: any) =>
        n.status === "Awaiting approvals" &&
        n.donor === "B" &&
        n.supply_id === "ORS",
    ),
  ).toBe(false);
  const consolePage = await context.newPage();
  await consolePage.goto("http://localhost:5174/?hospital=A");
  await consolePage
    .getByRole("button", { name: "Refresh workflow", exact: true })
    .click();
  await expect(consolePage.locator(".scan-map")).toBeVisible();
  await consolePage.screenshot({
    path: "../artifacts/five-stage-search.png",
    fullPage: true,
  });
  await expect(consolePage.locator(".negotiation-thread")).toBeVisible();
  await expect(consolePage.locator(".approval-wait")).toBeVisible();
  await expect(
    consolePage
      .locator(".approval-pair")
      .getByText("Awaiting approval", { exact: true }),
  ).toHaveCount(2);
  await expect(
    consolePage.locator(".workflow-stop-heading").nth(4),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Approvals", exact: true }).click();
  const proposal = page.locator(`[data-proposal-id="${n.id}"]`);
  await proposal
    .getByLabel("Counteroffer " + n.id)
    .fill(String(n.max_quantity + 10));
  await proposal.getByRole("button", { name: "Evaluate counteroffer" }).click();
  await proposal.locator("summary").click();
  await expect(proposal.getByText(/Cannot offer/)).toBeVisible();
  await proposal
    .getByRole("button", { name: "Approve transfer", exact: true })
    .click();
  await expect(
    proposal.getByRole("button", { name: "You approved" }),
  ).toBeVisible();
  const donor = await context.newPage();
  await login(donor, "D");
  await donor.getByRole("button", { name: "Approvals", exact: true }).click();
  const donorProposal = donor.locator(`[data-proposal-id="${n.id}"]`);
  await donorProposal
    .getByRole("button", { name: "Approve transfer", exact: true })
    .click();
  await expect(
    donorProposal.getByText("Reserved", { exact: true }),
  ).toBeVisible();
  await expect(consolePage.locator(".courier-simulation")).toBeVisible();
  const before = await (await request.get("/api/snapshot", { headers })).json();
  await consolePage
    .getByRole("button", { name: "Simulate delivery", exact: true })
    .click();
  await expect(
    consolePage.getByLabel("Rider accepted", { exact: true }),
  ).toBeVisible();
  await expect(
    consolePage.getByText(
      "Delivery received. Both hospitals’ inventory has been updated.",
    ),
  ).toBeVisible();
  await expect(
    consolePage.getByText("Ledger balanced", { exact: true }),
  ).toBeVisible();
  const after = await (await request.get("/api/snapshot", { headers })).json();
  const stock = (state: any, id: string) =>
    state.inventory
      .filter((b: any) => b.facility_id === id && b.supply_id === n.supply_id)
      .reduce((sum: number, b: any) => sum + b.quantity, 0);
  expect(stock(after, n.donor)).toBe(stock(before, n.donor) - n.quantity);
  expect(stock(after, n.recipient)).toBe(
    stock(before, n.recipient) + n.quantity,
  );
  await consolePage.screenshot({
    path: "../artifacts/five-stage-delivery.png",
    fullPage: true,
  });
});
test("responsive hospital dashboard and landing have no horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await login(page, "D");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "../artifacts/trio-mobile.png",
    fullPage: true,
  });
});

test("expiry edits update batch dates and trigger analysis", async ({
  page,
  request,
}) => {
  await request.post("/api/demo/onboarding-reset", { headers });
  await waitAnalysis(request, 6);
  await login(page, "D");
  await page
    .getByRole("button", { name: "Inventory management", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Edit D-ORS-01", exact: true })
    .click();
  await page.getByLabel("Expiry date").fill("2026-10-06");
  await page.getByRole("button", { name: "Save & reassess" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const state = await waitAnalysis(request, 6);
  expect(
    state.inventory.find((b: any) => b.id === "D-ORS-01").expires_at,
  ).toContain("2026-10-06");
  expect(
    state.events.some(
      (e: any) =>
        e.type === "INVENTORY_UPDATED" && e.details.batch_id === "D-ORS-01",
    ),
  ).toBe(true);
  expect(state.reconciliation.balanced).toBe(true);
});

test("console shows only the controlled hospital and all its products", async ({
  page,
  request,
}) => {
  await request.post("/api/demo/onboarding-reset", { headers });
  await waitAnalysis(request, 6);
  await page.goto("http://localhost:5174/?hospital=A");
  await expect(
    page.getByText("No hospital data imported", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".forecast-summary")).toHaveCount(0);
  for (const hospital of ["D", "B"]) {
    await page.getByLabel("Controlled hospital").selectOption(hospital);
    await expect(page.locator("select[aria-label=Product] option")).toHaveCount(
      3,
    );
    await expect(page.locator(".forecast-summary")).toHaveCount(1);
    const snapshot = await (
      await request.get("/api/snapshot", { headers })
    ).json();
    for (const supply of snapshot.supplies) {
      await page.getByLabel("Product", { exact: true }).selectOption(supply.id);
      await expect(page.locator(".forecast-summary h2")).toHaveText(
        supply.name,
      );
      const risk = snapshot.allocation.risks[hospital + ":" + supply.id];
      await expect(page.locator(".simple-numbers strong").first()).toHaveText(
        new Intl.NumberFormat("en-IN").format(risk.demand_7),
      );
      if (
        snapshot.allocation.searches[hospital + ":" + supply.id].kind === "none"
      ) {
        await expect(
          page.locator(".workflow-stop-heading").nth(1),
        ).toBeDisabled();
      }
    }
  }
});

test("refresh explains demand separately from stock and advances only for actionable products", async ({
  page,
  request,
}) => {
  await request.post("/api/demo/onboarding-reset", { headers });
  let snapshot = await waitAnalysis(request, 6);
  await page.goto("http://localhost:5174/?hospital=D");
  await expect(page.locator(".forecast-summary")).toBeVisible();
  const safe = snapshot.supplies.find(
    (s: any) => snapshot.allocation.searches["D:" + s.id].kind === "none",
  );
  expect(safe).toBeTruthy();
  await page.getByLabel("Product", { exact: true }).selectOption(safe.id);
  const refresh = page.waitForRequest(
    (r) => r.url().endsWith("/api/analysis-runs") && r.method() === "POST",
  );
  await page
    .getByRole("button", { name: "Refresh workflow", exact: true })
    .click();
  expect((await refresh).postDataJSON()).toEqual({ force: true });
  await waitAnalysis(request, 6);
  await expect(page.locator(".forecast-change")).toBeVisible();
  await expect(page.locator(".workflow-stop-heading").nth(0)).toHaveAttribute(
    "aria-current",
    "step",
  );
  await expect(page.locator(".workflow-stop-heading").nth(1)).toBeDisabled();
  await page.getByLabel("Product", { exact: true }).selectOption("ORS");
  const oldDemand = await page
    .locator(".simple-numbers strong")
    .first()
    .textContent();
  await page.locator(".forecast-explanation summary").click();
  await expect(page.locator(".forecast-equation")).toBeVisible();
  snapshot = await (await request.get("/api/snapshot", { headers })).json();
  const auth = await (
    await request.post("/api/auth/login", {
      data: { email: "admin@mandya.demo", password: "Demo@2026" },
    })
  ).json();
  for (const b of snapshot.inventory.filter(
    (b: any) => b.facility_id === "D" && b.supply_id === "ORS",
  )) {
    const response = await request.post("/api/inventory/batches/" + b.id, {
      headers: { "X-Demo-Session": auth.session },
      data: {
        quantity: 10,
        expires_at: b.expires_at,
        expected_quantity: b.quantity,
        expected_expiry: b.expires_at,
        reason: "Isolated browser test",
        command_id: crypto.randomUUID(),
      },
    });
    expect(response.ok()).toBe(true);
  }
  await waitAnalysis(request, 6);
  await expect(
    page.getByRole("button", { name: "Refresh workflow", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Refresh workflow", exact: true })
    .click();
  await expect(page.locator(".workflow-stop-heading").nth(1)).toHaveAttribute(
    "aria-current",
    "step",
  );
  await page.locator(".workflow-stop-heading").first().click();
  await expect(page.locator(".forecast-change")).toContainText(
    "The demand prediction stayed the same",
  );
  await expect(page.locator(".simple-numbers strong").first()).toHaveText(
    oldDemand!,
  );
  await expect(page.locator(".simple-numbers strong").nth(1)).toHaveText("20");
  await page.screenshot({
    path: "../artifacts/simple-forecast-console.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("hospital has four tabs, an empty approval inbox, and scoped approval login links", async ({
  page,
  request,
  context,
}) => {
  await request.post("/api/demo/onboarding-reset", { headers });
  await waitAnalysis(request, 6);
  await login(page, "A");
  await expect(page.locator(".sidebar nav button")).toHaveText([
    "Onboarding",
    "Past usage",
    "Inventory management",
    "Approvals",
  ]);
  await page.getByRole("button", { name: "Approvals", exact: true }).click();
  await expect(
    page.getByText("No approvals waiting.", { exact: false }),
  ).toBeVisible();
  await expect(page.locator("[data-proposal-id]")).toHaveCount(0);
  const linked = await context.newPage();
  await linked.goto("http://localhost:5173/hospital/D?tab=approvals");
  await expect(
    linked.locator(".trio-hospital-options button.selected"),
  ).toContainText("Mandya");
  await linked.getByLabel("Password").fill("Demo@2026");
  await linked.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(linked.locator("h1")).toHaveText("Approvals");
  await expect(linked.locator(".trio-identity")).toContainText("Mandya");
  await page.screenshot({
    path: "../artifacts/five-stage-hospital.png",
    fullPage: true,
  });
});

test("Hospital A logout empties its open console without affecting partners", async ({
  page,
  context,
  request,
}) => {
  await request.post("/api/demo/onboarding-reset", { headers });
  await waitAnalysis(request, 6);
  const imported = await request.post("/api/onboarding/csv", {
    headers: { "X-Demo-Session": "demo-A" },
    multipart: {
      file: {
        name: "A.csv",
        mimeType: "text/csv",
        buffer: readFileSync("../demo-data/three-hospital/A-hospital.csv"),
      },
    },
  });
  expect(imported.ok()).toBe(true);
  await waitAnalysis(request, 9);
  await page.goto("http://localhost:5174/?hospital=A");
  await expect(page.getByLabel("Product", { exact: true })).toBeEnabled();
  await expect(page.locator(".forecast-summary")).toHaveCount(1);
  const hospital = await context.newPage();
  await hospital.setViewportSize({ width: 641, height: 738 });
  await login(hospital, "A");
  const otherHospitalTab = await context.newPage();
  await login(otherHospitalTab, "A");
  await hospital.getByRole("button", { name: "Log out", exact: true }).click();
  await expect(hospital).toHaveURL("http://localhost:5173/");
  await expect(otherHospitalTab).toHaveURL("http://localhost:5173/?login=A");
  await expect(
    page.getByText("No hospital data imported", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Product", { exact: true })).toBeDisabled();
  await expect(page.locator("select[aria-label=Product] option")).toHaveText([
    "No products — upload CSV",
  ]);
  await expect(page.locator(".forecast-summary")).toHaveCount(0);
  await expect(page.locator(".workflow-stop")).toHaveCount(0);
  await waitAnalysis(request, 6);
  await expect(page.locator(".forecast-summary")).toHaveCount(0);
  await page.screenshot({
    path: "../artifacts/empty-hospital-console.png",
    fullPage: true,
  });
  await page.getByLabel("Controlled hospital").selectOption("B");
  await expect(page.getByLabel("Product", { exact: true })).toBeEnabled();
  await expect(page.locator(".forecast-summary")).toHaveCount(1);
});
