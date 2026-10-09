import { expect } from "@playwright/test";
import { test } from "./fixtures";

test("landing sections render, explain workflow steps, and open login", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.locator('a[href="#how-it-works"]').click();
  await expect(
    page.getByRole("heading", {
      name: "From stock count to delivery in four supervised steps.",
    }),
  ).toBeVisible();
  await page.locator(".how-step").nth(2).click();
  await expect(page.locator("#how-panel")).toContainText(
    "Requesting whole packs",
  );
  await page.locator('a[href="#features"]').click();
  await expect(page.locator("#features .feature")).toHaveCount(6);
  await page.locator('a[href="#faq"]').click();
  await page
    .locator(".faq summary")
    .filter({ hasText: "Can a donor hospital run short by giving stock away?" })
    .click();
  await expect(
    page
      .locator(".faq[open]")
      .filter({ hasText: "Can a donor hospital run short" }),
  ).toContainText("28 days");
  await page.locator(".faq-cta button").click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(errors).toEqual([]);
});
