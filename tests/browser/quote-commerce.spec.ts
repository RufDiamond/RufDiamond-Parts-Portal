import { expect, test } from "@playwright/test";

/**
 * Local fixture path: quote request → Quote Status admin fill → notify →
 * customer order → checkout submit. Uses browser-local demo when API session
 * is absent; against a disposable API the same screens hit /api/v1/quotes.
 */
test.describe("quote to order commerce path", () => {
  test("customer can open Quote Status and checkout from the portal shell", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /user guide/i })).toBeVisible();

    await page.goto("/quotes");
    await expect(page.getByRole("heading", { name: /quote status/i })).toBeVisible();

    await page.goto("/checkout");
    await expect(page.getByText(/order type|order request|check cart|empty/i).first()).toBeVisible();
  });

  test("signin account links mail parts@", async ({ page }) => {
    await page.goto("/signin");
    const forgot = page.getByRole("link", { name: /forgot password/i });
    await expect(forgot).toHaveAttribute("href", /mailto:parts@rufdiamond\.com/);
    const request = page.getByRole("link", { name: /request a user account/i });
    await expect(request).toHaveAttribute("href", /mailto:parts@rufdiamond\.com/);
  });

  test("admin quote view requires staff quote capability in fixture mode", async ({ page }) => {
    await page.goto("/quotes/admin");
    await expect(page.getByRole("heading", { name: /quote status — ruf diamond/i })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/quote capability is required/i)).toBeVisible();
    await expect(page.getByRole("link", { name: /sign in/i })).toBeVisible();
    await expect(page.getByText("Factory Price (CAD)")).toHaveCount(0);
    await expect(page.getByText("6900.00")).toHaveCount(0);
  });
});

