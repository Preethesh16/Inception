import { expect } from "@playwright/test";
import { test } from "./fixtures";
import { readFileSync } from "node:fs";
const headers = { "X-Demo-Session": "demo-judge" };
test("fresh CSV has no approvals; a real stock change creates an explained agreement", async ({
  page,
  request,
}) => {
  test.setTimeout(300000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await request.post("/api/demo/onboarding-reset", { headers });
  await request.post("/api/onboarding/csv", {
    headers: { "X-Demo-Session": "demo-A" },
    multipart: {
      file: {
        name: "A.csv",
        mimeType: "text/csv",
        buffer: readFileSync("../demo-data/three-hospital/A-hospital.csv"),
      },
    },
  });
  const snapshot = async () =>
    (await request.get("/api/snapshot", { headers })).json();
  await expect
    .poll(
      async () =>
        !(await snapshot()).jobs.some((j: any) =>
          ["queued", "running"].includes(j.status),
        ),
    )
    .toBe(true);
  expect((await snapshot()).negotiations).toHaveLength(0);
  await page.goto("/login?login=A");
  await expect(
    page.getByRole("heading", { name: "Sign in to your hospital" }),
  ).toBeVisible();
  await page.getByLabel("Email", { exact: true }).fill("admin@kaveri.demo");
  await page.getByLabel("Password", { exact: true }).fill("Demo@2026");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page).toHaveURL(/\/hospital\/A$/);
  await page.getByRole("button", { name: "Approvals", exact: true }).click();
  await expect(page.getByText(/No approvals waiting/)).toBeVisible();
  const state = await snapshot();
  const b = state.inventory.find((b: any) => b.id === "A-ORS-02");
  const edited = await request.post("/api/inventory/batches/A-ORS-02", {
    headers: { "X-Demo-Session": "demo-A" },
    data: {
      quantity: 0,
      expires_at: b.expires_at,
      expected_quantity: b.quantity,
      expected_expiry: b.expires_at,
      command_id: "agreement-test",
      reason: "Demo shortage",
    },
  });
  expect(edited.ok()).toBeTruthy();
  await expect
    .poll(
      async () =>
        (await snapshot()).negotiations.some(
          (n: any) => n.status === "Awaiting approvals",
        ),
      { timeout: 240000 },
    )
    .toBe(true);
  await page.reload();
  await page.getByRole("button", { name: "Approvals", exact: true }).click();
  const contract = page.locator(".transfer-contract").first();
  await expect(contract.getByText(/TRANSFER AGREEMENT/)).toBeVisible();
  await expect(
    contract.getByRole("region", { name: "Decision explanation" }),
  ).toBeVisible();
  await expect(
    contract.getByText("Supplier approval", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Ask agent to explain this decision" }),
  ).toHaveCount(0);
  await expect(
    contract.getByRole("button", { name: "Approve transfer", exact: true }),
  ).toBeEnabled();
  await page.screenshot({
    path: "../artifacts/transfer-agreement.png",
    fullPage: true,
  });
});
