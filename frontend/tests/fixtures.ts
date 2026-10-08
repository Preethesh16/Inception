import { test as base } from "@playwright/test";

// Point browser and API requests at a disposable backend without resetting the
// hospital data in the user's running demonstration.
export const test = base.extend({
  request: async ({ playwright, request }, use) => {
    const target = process.env.E2E_API_TARGET;
    if (!target) return use(request);
    const isolated = await playwright.request.newContext({ baseURL: target });
    const proxy = new Proxy(isolated, {
      get(obj, prop) {
        if (prop === "get" || prop === "post")
          return (url: string, options: any) =>
            obj[prop](url.replace(/^\/api/, ""), options);
        const value = Reflect.get(obj, prop);
        return typeof value === "function" ? value.bind(obj) : value;
      },
    });
    await use(proxy);
    await isolated.dispose();
  },
  context: async ({ context }, use) => {
    const target = process.env.E2E_API_TARGET;
    if (target)
      await context.route("**/api/**", async (route) => {
        const url = new URL(route.request().url());
        if (url.pathname === "/api/events/stream") return route.abort();
        await route.continue({
          url: target + url.pathname.replace(/^\/api/, "") + url.search,
        });
      });
    await use(context);
  },
});
