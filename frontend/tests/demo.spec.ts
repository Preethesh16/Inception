import { test, expect, type Page } from "@playwright/test";
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
    .getByRole("button", { name: "Manage inventory", exact: true })
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
  const consolePage = await context.newPage();
  await consolePage.goto("http://localhost:5174");
  await expect(
    consolePage.getByRole("heading", { name: "Every decision, visible." }),
  ).toBeVisible();
  await consolePage.getByLabel("Follow actionable stages").uncheck();
  for (const name of [
    "Claim courier job",
    "Confirm pickup",
    "Start transit",
    "Confirm receipt",
  ])
    await consolePage.getByRole("button", { name, exact: true }).click();
  await expect(
    consolePage.getByText("Ledger balanced", { exact: true }),
  ).toBeVisible();
  await expect(consolePage.locator(".console-stage.done")).toHaveCount(6);
  await consolePage.screenshot({
    path: "../artifacts/trio-console.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "AI chat", exact: true }).click();
  await page
    .getByLabel("Your question")
    .fill("Which supplies may run out before replenishment?");
  await page.getByRole("button", { name: "Ask agent", exact: true }).click();
  await expect(page.locator(".trio-chat article")).toHaveCount(1);
  await page.screenshot({ path: "../artifacts/trio-chat.png", fullPage: true });
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
    .getByRole("button", { name: "Manage inventory", exact: true })
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
    page.getByText("Awaiting hospital onboarding", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Forecast series")).toHaveCount(0);
  await page.getByLabel("Controlled hospital").selectOption("D");
  await expect(page.getByLabel("Forecast series")).toHaveCount(3);
  const labels = await page.getByLabel("Forecast series").allTextContents();
  expect(
    labels.every(
      (s) => s.includes("Mandya Regional Hospital") && !s.includes("Chamundi"),
    ),
  ).toBe(true);
  await expect(
    page.getByText("Product-by-product search decisions", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Controlled hospital").selectOption("B");
  await expect(page.getByLabel("Forecast series")).toHaveCount(3);
  expect(
    (await page.getByLabel("Forecast series").allTextContents()).every((s) =>
      s.includes("Chamundi Community Hospital"),
    ),
  ).toBe(true);
});
