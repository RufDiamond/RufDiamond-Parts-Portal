import { expect, test, type APIRequestContext, type BrowserContext, type Locator } from "@playwright/test";

// These cases are independently established in the source audits under tools/callouts/review.
const mapped = [
  { figure: "fig-filters-1-1", ref: 3, row: "fp-1-1-03", part: "56-00007", count: 1, sourceId: "co-1-1-0003" },
  { figure: "fig-frame-assy-2-1", ref: 4, row: "fp-2-1-04", part: "12-210000-12", count: 2, sourceId: "co-2-1-0010" },
  { figure: "fig-hydraulic-4-1", ref: 14, row: "fp-4-1-14", part: "54-00024", count: 3, sourceId: "co-4-1-0044" },
  { figure: "fig-tire-wheel-5-1", ref: 4, row: "fp-5-1-04", part: "10-208040-121", count: 16, sourceId: "co-5-1-0106" },
];
const hosted = !!process.env.RUF_E2E_BASE_URL;
const marker = 'button[data-callout-id]';
const component = 'path[role="button"][data-callout-id]';

async function assertSelected(drawing: Locator, part: string, expectedIds: readonly string[]) {
  const selected = drawing.locator(`${marker}[aria-pressed="true"]`);
  await expect(selected).toHaveCount(1);
  await expect(selected).toHaveAccessibleName(new RegExp(`: ${part} — `));
  await expect.poll(() => drawing.locator(`${component}[aria-pressed="true"]`).evaluateAll(paths =>
    [...new Set(paths.map(path => path.getAttribute("data-callout-id")))].sort(),
  )).toEqual([...expectedIds].sort());
  for (const shape of await drawing.locator(`${component}[aria-pressed="true"]`).all()) {
    await expect(shape).toHaveAccessibleName(new RegExp(`: ${part}(?: — |$)`));
  }
}

async function exposedPoint(path: Locator) {
  return path.evaluate(element => {
    const shape = element as SVGGeometryElement;
    const box = shape.getBoundingClientRect();
    const inverse = shape.getScreenCTM()?.inverse();
    if (!inverse) return null;
    for (let x = Math.ceil(Math.max(box.left, 0)); x < Math.min(box.right, innerWidth); x++) {
      for (let y = Math.ceil(Math.max(box.top, 0)); y < Math.min(box.bottom, innerHeight); y++) {
        const screen = new DOMPoint(x, y);
        if (document.elementFromPoint(x, y) === shape && shape.isPointInFill(screen.matrixTransform(inverse))) return { x, y };
      }
    }
    return null;
  });
}

for (const device of ["desktop", "phone"] as const) {
  test.describe(device, () => {
    const phone = device === "phone";
    test.use({
      viewport: phone ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
      hasTouch: phone, isMobile: phone,
      ...(hosted ? { trace: "off", screenshot: "off" } as const : {}),
    });
    let hostedSession: APIRequestContext | undefined;
    let cookies: Awaited<ReturnType<BrowserContext["cookies"]>> = [];
    let csrfToken: string | undefined;
    const origin = hosted ? new URL(process.env.RUF_E2E_BASE_URL!).origin : "";
    test.beforeAll(async ({ playwright }) => {
      if (!hosted) return;
      const password = process.env.RUF_E2E_PASSWORD;
      if (!password) throw new Error("Provide RUF_E2E_PASSWORD securely for authenticated Render verification.");
      hostedSession = await playwright.request.newContext({ baseURL: origin });
      const login = await hostedSession.post("/api/v1/auth/sign-in", {
        headers: { origin }, data: { loginId: process.env.RUF_E2E_LOGIN ?? "demo-purchaser", password },
      });
      expect(login.status()).toBe(200);
      ({ cookies } = await hostedSession.storageState());
      ({ csrfToken } = await login.json());
    });
    test.beforeEach(async ({ context }) => {
      if (cookies.length) await context.addCookies(cookies);
    });
    test.afterAll(async () => {
      try {
        if (hostedSession && csrfToken) {
          const logout = await hostedSession.post("/api/v1/auth/sign-out", {
            headers: { origin, "x-csrf-token": csrfToken }, data: {},
          });
          expect(logout.status()).toBe(200);
        }
      } finally {
        await hostedSession?.dispose();
        cookies = [];
      }
    });

    for (const entry of mapped) {
      test(`${entry.figure} ref ${entry.ref} selects the exact row, label and ${entry.count} components`, async ({ page }, info) => {
        await page.goto(`/figures/${entry.figure}`);
        const drawing = page.locator("figure").first();
        const row = page.locator(`tr[data-figure-part-id="${entry.row}"]`);
        const labelName = new RegExp(`^Callout ${entry.ref}: ${entry.part} — `);
        const labels = drawing.getByRole("button", { name: labelName });
        const expectedIds = [entry.sourceId, ...Array.from({ length: entry.count - 1 }, (_, i) =>
          `${entry.sourceId}__instance-${entry.sourceId}-physical-${i + 2}`)];
        const clear = page.getByRole("button", { name: "Clear selection", exact: true });
        await expect(row.getByRole("rowheader", { name: entry.part })).toBeVisible();
        await expect(labels).toHaveCount(entry.count);
        await row.getByRole("rowheader").click();
        await expect(row).toHaveAttribute("data-active", "true");
        await assertSelected(drawing, entry.part, expectedIds);

        if (entry.ref === 3) {
          await page.getByRole("button", { name: /^Add to cart/ }).click();
          const cart = page.getByRole("dialog");
          await expect(cart.getByText(entry.part, { exact: true })).toBeVisible();
          await cart.getByRole("button", { name: "Cancel", exact: true }).click();
        }

        await clear.click();
        await expect(labels).toHaveCount(entry.count);
        if (phone) await labels.first().tap(); else await labels.first().press("Enter");
        await expect(row).toHaveAttribute("data-active", "true");
        await assertSelected(drawing, entry.part, expectedIds);
        await page.getByRole("button", { name: "Illustration full screen", exact: true }).click();
        const dialog = page.getByRole("dialog");
        const full = dialog.locator("figure");
        await assertSelected(full, entry.part, expectedIds);
        await dialog.getByRole("button", { name: "Clear selection", exact: true }).click();
        await expect(full.getByRole("button", { name: labelName })).toHaveCount(entry.count);
        const zoom = dialog.getByRole("button", { name: "Zoom in", exact: true });
        if (phone) {
          await zoom.click();
        } else {
          const image = full.locator("img");
          const box = (await image.boundingBox())!;
          await page.mouse.move(box.x + box.width / 2, box.y + Math.min(box.height / 2, 100));
          await page.mouse.wheel(0, -130);
          await expect.poll(async () => (await image.boundingBox())!.width).toBeGreaterThan(box.width);
        }
        // Test both physical nut targets independently on the corrected Bumper sheet.
        const nativeTargets = entry.row === "fp-2-1-04" ? expectedIds : expectedIds.slice(0, 1);
        for (const id of nativeTargets) {
          const path = full.locator(`${component}[data-callout-id="${id}"]`).first();
          await path.scrollIntoViewIfNeeded();
          await expect.poll(() => exposedPoint(path)).not.toBeNull();
          const point = (await exposedPoint(path))!;
          if (phone) await page.touchscreen.tap(point.x, point.y); else await page.mouse.click(point.x, point.y);
          const chooser = dialog.getByRole("group", { name: "Choose overlapping component" });
          if (await chooser.isVisible()) await chooser.getByRole("button", { name: `Ref ${entry.ref} — ${entry.part}` }).click();
          await assertSelected(full, entry.part, expectedIds);
          if (id !== nativeTargets.at(-1)) {
            await dialog.getByRole("button", { name: "Clear selection", exact: true }).click();
          }
        }
        await page.screenshot({ path: info.outputPath(`${entry.figure}-ref${entry.ref}.png`) });
        await dialog.getByRole("button", { name: "Close the illustration" }).click();
        await expect(row).toHaveAttribute("data-active", "true");
        await clear.click();
        await expect(labels).toHaveCount(entry.count);
      });
    }

    for (const entry of [
      { figure: "fig-cabin-6-15", imageCount: 0 },
      { figure: "fig-cabin-6-13", imageCount: 1 },
    ]) {
      test(`${entry.figure} keeps source exceptions free of unverified overlays`, async ({ page }) => {
        await page.goto(`/figures/${entry.figure}`);
        const drawing = page.locator("figure").first();
        await expect(page.locator("tr[data-figure-part-id]").first()).toBeVisible();
        await expect(drawing).toBeVisible();
        await expect(drawing.locator("img")).toHaveCount(entry.imageCount);
        await expect(drawing.locator(`${marker}, ${component}`)).toHaveCount(0);
      });
    }

    test("a reference-only part explains its limit and still selects the correct row", async ({ page }) => {
      await page.goto("/figures/fig-engine-8-4");
      const label = page.locator("figure").first().getByRole("button", { name: /^Callout 15: 32-00035 — / });
      if (phone) await label.tap(); else await label.click();
      await expect(page.locator('tr[data-figure-part-id="fp-8-4-15"]')).toHaveAttribute("data-active", "true");
      await expect(page.getByText("1 selected occurrence has a reference label only.")).toBeAttached();
      await expect(page.locator(`figure ${component}[aria-pressed="true"]`)).toHaveCount(0);
    });
  });
}
