import { expect } from "@playwright/test";
import { test } from "./fixtures";

test("landing sections render, explain workflow steps, and open login", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  await page.locator('a[href="#how-it-works"]').click();
  await expect(page.getByRole("heading", { name: "From stock to shared care." })).toBeVisible();
  await page.locator(".how-step").nth(2).click();
  await expect(page.locator("#how-preview")).toContainText("Protect the donating hospital");
  await page.locator('a[href="#features"]').click();
  await expect(page.locator("#features .feature")).toHaveCount(4);
  await page.locator('a[href="#faq"]').click();
  await page.locator(".faq summary").filter({ hasText: "Does the system move stock automatically?" }).click();
  await expect(page.locator(".faq[open]")).toContainText("both hospitals must approve");
  await page.locator(".faq-cta button").click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(errors).toEqual([]);
});
