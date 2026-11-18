import { expect, test, type Page } from "@playwright/test";

test.skip(process.env.RUF_E2E_CHECKOUT !== "1", "Explicit opt-in: submits a clearly marked test order to the hosted database.");

async function signIn(page: Page) {
  const password = process.env.RUF_E2E_PASSWORD;
  if (!password) throw new Error("Supply the existing purchaser credential through the test environment.");
  await page.goto("/signin");
  await page.getByLabel("Username:", { exact: true }).fill("demo-purchaser");
  await page.getByLabel("Password:", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("button", { name: "Sign out", exact: true })).toBeVisible({ timeout: 70000 });
}

test("purchaser checks out a priced FT3 part and reads the saved order after a fresh login", async ({ page, context }, info) => {
  await signIn(page);
  expect((await (await context.request.get("/api/v1/me")).json()).capabilities).toContain("orders.submit");
  await expect(page.getByRole("link", { name: "User accounts", exact: true })).toHaveCount(0);
  await page.goto("/figures/fig-frame-assy-2-1");
  await page.locator('tr[data-figure-part-id="fp-2-1-01"]').getByRole("checkbox").check();
  await page.getByRole("button", { name: /^Add to cart/ }).click();
  const confirmation = page.getByRole("dialog", { name: "Confirm parts to add to the cart" });
  await expect(confirmation.getByText("Quote required", { exact: true })).toHaveCount(0);
  await confirmation.getByRole("button", { name: "Add to cart", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "OK", exact: true }).click();
  await page.goto("/checkout");
  await page.getByRole("radio", { name: "Regular Order", exact: true }).check();
  await page.getByRole("button", { name: /Continue to order type detail/ }).click();
  const po = `E2E-FT3-${Date.now()}`;
  await page.getByLabel("PO No.:", { exact: true }).fill(po);
  await page.getByLabel("VIN No.:", { exact: true }).fill("TEST-DO-NOT-FULFIL");
  await page.getByRole("button", { name: /Continue to shipping method/ }).click();
  await page.getByRole("radio", { name: "Purolator Ground", exact: true }).check();
  await page.getByRole("button", { name: /Continue to shipping and billing address/ }).click();
  const shipping = page.getByRole("heading", { name: "Shipping Address", exact: true }).locator("..");
  for (const [label, value] of [
    ["First Name:", "Automated"], ["Last Name:", "Verification"], ["Company:", "RUF TEST — DO NOT FULFIL"],
    ["Address:", "1 Test Street"], ["City:", "Sudbury"], ["Postal Code:", "P3E 2C6"],
    ["Email:", "checkout-test@example.test"], ["Phone No.:", "7055550100"],
  ]) await shipping.getByLabel(label, { exact: true }).fill(value);
  await shipping.getByLabel("Province:", { exact: true }).selectOption({ label: "Ontario" });
  await page.getByRole("checkbox", { name: "Shipping address is same as billing address" }).check();
  for (const save of await page.getByRole("checkbox", { name: "Save this new address", exact: true }).all()) await save.uncheck();
  await page.getByRole("button", { name: /Continue to special instructions/ }).click();
  await page.getByRole("textbox", { name: "Special instructions", exact: true }).fill("AUTOMATED CHECKOUT VERIFICATION — DO NOT FULFIL. No shipment or email requested.");
  await page.getByRole("button", { name: /Review order/ }).click();
  await expect(page.getByText("82-00127", { exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath("purchaser-checkout-review.png"), fullPage: true });
  const submitted = page.waitForResponse(response => response.url().endsWith("/api/v1/commerce-orders") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Submit order", exact: true }).click();
  const response = await submitted;
  expect(response.status(), await response.text()).toBe(201);
  const result = await response.json();
  await expect(page.getByRole("link", { name: "View saved orders", exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath("purchaser-order-submitted.png"), fullPage: true });
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/signin$/);
  expect((await context.request.get("/api/v1/me")).status()).toBe(401);
  await signIn(page);
  await page.goto("/orders");
  const saved = page.locator(`#order-${result.id}`);
  await expect(saved).toContainText(result.reference);
  await expect(saved).toContainText(po);
  await expect(saved).toContainText("82-00127");
  await expect(saved).toContainText("645.86");
  const historyResponse = await context.request.get("/api/v1/commerce-orders/mine");
  expect(historyResponse.status()).toBe(200);
  const order = (await historyResponse.json()).items.find((item: { id: string }) => item.id === result.id);
  expect(order).toMatchObject({ customerPo: po, status: "submitted", lines: [{ partNumber: "82-00127", qty: 1 }] });
  await info.attach("saved-order", { body: JSON.stringify(order, null, 2), contentType: "application/json" });
  await page.screenshot({ path: info.outputPath("purchaser-saved-order-after-login.png"), fullPage: true });
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  expect((await context.request.get("/api/v1/me")).status()).toBe(401);
});
