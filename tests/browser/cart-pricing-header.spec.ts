import { expect, test } from "@playwright/test";

test.use({ trace: "off", screenshot: "off" });
test.skip(!process.env.RUF_E2E_BASE_URL, "This check uses an authorized hosted catalogue account.");

const origin = process.env.RUF_E2E_BASE_URL;

test("staff controls and mixed-price cart work on desktop and phone", async ({ page, context }, info) => {
  test.setTimeout(180000);
  const password = process.env.RUF_E2E_PASSWORD;
  if (!password || !origin) throw new Error("Supply the existing admin credential through the test environment.");
  const login = await context.request.post("/api/v1/auth/sign-in", {
    headers: { origin }, data: { loginId: "demo-catalog-admin", password },
  });
  expect(login.status()).toBe(200);
  const { csrfToken } = await login.json();
  try {
    await page.goto("/");
    const signOut = page.getByRole("button", { name: "Sign out", exact: true });
    await expect(signOut).toBeVisible();
    const navigation = page.getByRole("navigation", { name: "Staff administration" });
    await expect(navigation.getByRole("link", { name: "Quote admin", exact: true })).toHaveAttribute("href", "/quotes/admin");
    await expect(navigation.getByRole("link", { name: "Dealer discounts", exact: true })).toHaveAttribute("href", "/admin/discounts");
    await expect(navigation.getByRole("link", { name: "User accounts", exact: true })).toHaveAttribute("href", "/admin/users");
    for (const width of [1600, 1024, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await expect(signOut).toBeVisible();
      const bounds = await navigation.getByRole("link").evaluateAll(links => links.map(link => {
        const r = link.getBoundingClientRect();
        return { x: r.x, y: r.y, right: r.right, bottom: r.bottom };
      }));
      for (const box of bounds) {
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.right).toBeLessThanOrEqual(width);
        expect(box.bottom - box.y).toBeGreaterThanOrEqual(38);
      }
      for (let i = 0; i < bounds.length; i++) for (let j = i + 1; j < bounds.length; j++) {
        const a = bounds[i], b = bounds[j];
        expect(a.right <= b.x || b.right <= a.x || a.bottom <= b.y || b.bottom <= a.y).toBe(true);
      }
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
      await page.locator("header").screenshot({ path: info.outputPath(`staff-header-${width}.png`) });
    }
    await page.setViewportSize({ width: 1600, height: 1000 });
    for (const [name, path] of [["Quote admin", "/quotes/admin"], ["Dealer discounts", "/admin/discounts"], ["User accounts", "/admin/users"]]) {
      await navigation.getByRole("link", { name, exact: true }).click();
      await expect(page).toHaveURL(new URL(path, origin).href);
      await expect(navigation.getByRole("link", { name, exact: true })).toHaveAttribute("aria-current", "page");
    }

    await page.goto("/figures/fig-frame-assy-2-1");
    const pricedRow = page.locator('tr[data-figure-part-id="fp-2-1-01"]');
    const unpricedRow = page.locator('tr[data-figure-part-id="fp-2-1-04"]');
    await pricedRow.getByRole("checkbox").check();
    await unpricedRow.getByRole("checkbox").check();
    await page.getByRole("button", { name: /^Add to cart/ }).click();
    const confirmation = page.getByRole("dialog", { name: "Confirm parts to add to the cart" });
    const priced = confirmation.getByText("82-00127", { exact: true }).locator("..");
    const unpriced = confirmation.getByText("12-210000-12", { exact: true }).locator("..");
    await expect(priced).not.toHaveAttribute("data-quote-required", "true");
    await expect(priced.getByText("645.86").first()).toBeVisible();
    await expect(unpriced).toHaveAttribute("data-quote-required", "true");
    await expect(confirmation.getByText("Quote required", { exact: true })).toHaveCount(1);
    await confirmation.screenshot({ path: info.outputPath("mixed-price-confirmation.png") });
    await confirmation.getByRole("button", { name: "Add to cart", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "OK", exact: true }).click();
    await page.getByRole("button", { name: /^Cart · 2$/ }).click();
    const cart = page.getByRole("dialog", { name: "Cart", exact: true });
    await expect(cart.getByText("Quote required", { exact: true })).toHaveCount(1);
    await expect(cart.getByText("CAD 645.86 × 1", { exact: true })).toBeVisible();
    await cart.getByRole("link", { name: "Request a quote", exact: true }).click();
    await expect(page.getByText("12-210000-12", { exact: true })).toBeVisible();
    await expect(page.getByText("82-00127", { exact: true })).toHaveCount(0);
    await page.goto("/checkout");
    await expect(page.getByText("Catalogue approval pending", { exact: true })).toBeVisible();
    await expect(page.getByText(/1 item needs pricing/)).toBeVisible();
    await expect(page.getByText("A priced quote is required", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Submit order", exact: true })).toHaveCount(0);
    await signOut.click();
    await expect(page).toHaveURL(new URL("/signin", origin).href);
    expect((await context.request.get("/api/v1/me")).status()).toBe(401);
  } finally {
    await context.request.post("/api/v1/auth/sign-out", { headers: { origin, "x-csrf-token": csrfToken }, data: {} });
  }
});
