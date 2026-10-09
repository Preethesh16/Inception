import { test, expect } from "@playwright/test";

test("available languages translate headings, persist, and restore English", async ({
  page,
}) => {
  await page.route("**/api/ui/translate", async (route) => {
    const { language, texts } = route.request().postDataJSON();
    const words: Record<string, string> = {
      hi: "अनुवाद",
      kn: "ಅನುವಾದ",
      ta: "மொழிபெயர்ப்பு",
      te: "అనువాదం",
    };
    await route.fulfill({
      json: {
        language,
        translations: texts.map((text: string) => words[language] + " " + text),
      },
    });
  });
  await page.goto("http://localhost:5174/?hospital=A");
  const welcome = page.locator("#welcome-language");
  await expect(welcome.locator("option")).toHaveCount(5);
  await welcome.selectOption("hi");
  await page.locator(".language-welcome button").click();
  await expect(page.locator("html")).toHaveAttribute("lang", "hi");
  await expect(page.locator(".trio-header h1")).toContainText("बैक");
  for (const [code, script] of [
    ["kn", /[\u0c80-\u0cff]/],
    ["ta", /[\u0b80-\u0bff]/],
    ["te", /[\u0c00-\u0c7f]/],
  ] as const) {
    await page.locator("#website-language").selectOption(code);
    await expect(page.locator(".trio-header h1")).toContainText(script);
  }
  await page.reload();
  await expect(page.locator("#website-language")).toHaveValue("te");
  await page.locator("#website-language").selectOption("en");
  await expect(page.locator(".trio-header h1")).toHaveText("Backend workflow");
});

test("translation failure is disclosed without changing the selected language", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("inception-language", "kn"),
  );
  await page.route("**/api/ui/translate", (route) =>
    route.fulfill({ status: 503, json: { detail: "Unavailable" } }),
  );
  await page.route("**/api/snapshot", async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    data.facilities[0].name = "Unique hospital translation check";
    await route.fulfill({ json: data });
  });
  await page.goto("http://localhost:5174/?hospital=A");
  await expect(page.locator(".trio-header h1")).toContainText(
    /[\u0c80-\u0cff]/,
  );
  await expect(page.locator(".language-picker button")).toBeVisible({
    timeout: 15000,
  });
  await expect(page.locator("#website-language")).toHaveValue("kn");
});
