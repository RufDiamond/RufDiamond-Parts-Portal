import { expect, test, type Locator, type Page } from "@playwright/test";

const base = process.env.DIAGRAM_BASE_URL ?? "http://localhost:3100";
const cases = [
  { name:"Windows", route:"/figures/fig-cabin-6-1", ref:2 },
  { name:"Filters", route:"/figures/fig-filters-1-1", ref:1 },
  { name:"corrected bumper", route:"/review/figures/fig-frame-assy-2-1", ref:1 },
  { name:"Hydraulic 4.4", route:"/review/figures/fig-hydraulic-4-4", ref:1 },
];
const figure = (page:Page) => page.locator("figure").first();
const stage = (scope:Locator) => scope.locator("img").locator("..");
async function zoom(scope:Locator) { return stage(scope).evaluate((el) => Number((el as HTMLElement).style.getPropertyValue("--zoom"))); }
async function settled(page:Page) { await page.waitForTimeout(220); }

async function geometry(scope:Locator) {
  const result = await scope.evaluate((root) => {
    const image = root.querySelector("img")!;
    const rect = image.getBoundingClientRect();
    const errors:number[] = [];
    for (const svg of root.querySelectorAll("svg")) {
      const box = svg.getBoundingClientRect();
      errors.push(...["left","top","width","height"].map((key) => Math.abs(box[key as keyof DOMRect] as number - (rect[key as keyof DOMRect] as number))));
      const vb = svg.viewBox.baseVal;
      const matrix = svg.getScreenCTM()!;
      const origin = new DOMPoint(0,0).matrixTransform(matrix);
      const end = new DOMPoint(vb.width,vb.height).matrixTransform(matrix);
      errors.push(Math.abs(origin.x-rect.left), Math.abs(origin.y-rect.top), Math.abs(end.x-rect.right), Math.abs(end.y-rect.bottom));
    }
    for (const button of root.querySelectorAll<HTMLButtonElement>('button[style*="left:"]')) {
      const box = button.getBoundingClientRect();
      errors.push(Math.abs(box.left+box.width/2-(rect.left+parseFloat(button.style.left)/100*rect.width)),
        Math.abs(box.top+box.height/2-(rect.top+parseFloat(button.style.top)/100*rect.height)));
    }
    return { maxError:Math.max(...errors), imageWidth:rect.width, imageHeight:rect.height, overlays:root.querySelectorAll("svg").length };
  });
  expect(result.imageWidth).toBeGreaterThan(0);
  expect(result.maxError).toBeLessThanOrEqual(1);
  return result;
}

async function componentPoint(scope:Locator) {
  return scope.locator("svg[data-diagram-regions] path").evaluateAll((paths) => {
    for (const element of paths) {
      const path = element as SVGGeometryElement;
      const b = path.getBBox();
      for (let i=1;i<10;i++) for (let j=1;j<10;j++) {
        const point = new DOMPoint(b.x+b.width*i/10, b.y+b.height*j/10);
        if (!path.isPointInFill(point)) continue;
        const screen = point.matrixTransform(path.getScreenCTM()!);
        if (document.elementFromPoint(screen.x, screen.y) === path) return { x:screen.x, y:screen.y, label:path.getAttribute("aria-label")! };
      }
    }
    return null;
  });
}

async function wheels(page:Page, scope:Locator) {
  for (const target of ["image", "label", ...(await scope.locator("svg[data-diagram-regions] path").count() ? ["component"] : [])]) {
    for (const direction of [-120,120]) {
      if (target === "image") await scope.locator("img").hover({ position:{ x:10, y:10 } });
      else if (target === "label") await scope.getByRole("button", { name:/^Callout/ }).first().hover();
      else {
        const point = await componentPoint(scope);
        expect(point).not.toBeNull();
        await page.mouse.move(point!.x,point!.y);
      }
      const before = await zoom(scope);
      await page.mouse.wheel(0,direction);
      await expect.poll(() => zoom(scope)).toBe(direction < 0 ? 1.5 : 1);
      expect(before).toBe(direction < 0 ? 1 : 1.5);
      await settled(page);
    }
  }
}

for (const fixture of cases) test(`${fixture.name}: native input and pixel geometry at fit, zoom, fullscreen and resize`, async ({ page }, info) => {
  const errors:string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(base + fixture.route);
  await expect(figure(page).locator("img")).toBeVisible();
  await settled(page);
  const label = figure(page).getByRole("button", { name:new RegExp(`^Callout ${fixture.ref}:`) }).first();
  await label.click();
  await page.mouse.move(0,0);
  await expect(label).toHaveAttribute("aria-pressed","true");
  const measurements = [{ state:"fit", ...await geometry(figure(page)) }];
  await wheels(page,figure(page));
  await page.getByRole("button", { name:"Zoom in", exact:true }).click();
  await settled(page);
  measurements.push({ state:"zoom", ...await geometry(figure(page)) });
  await page.getByRole("button", { name:"Show selected part", exact:true }).click();
  await settled(page);
  await page.getByRole("button", { name:"Illustration full screen", exact:true }).click();
  const full = page.getByRole("dialog").locator("figure");
  await settled(page);
  measurements.push({ state:"fullscreen", ...await geometry(full) });
  await wheels(page,full);
  await page.getByRole("dialog").getByRole("button", { name:"Zoom in", exact:true }).click();
  await settled(page);
  measurements.push({ state:"fullscreen zoom", ...await geometry(full) });
  await page.getByRole("dialog").getByRole("button", { name:"Show selected part", exact:true }).click();
  await page.setViewportSize({ width:1280, height:900 });
  await settled(page);
  measurements.push({ state:"fullscreen resized", ...await geometry(full) });
  await page.getByRole("button", { name:"Close the illustration" }).click();
  await settled(page);
  measurements.push({ state:"resized", ...await geometry(figure(page)) });
  // Active filters preserve their value and show the exact selected source row once.
  const selectedRows = page.locator('tr[data-figure-part-id][data-active]');
  const exactRow = await selectedRows.first().getAttribute("data-figure-part-id");
  await page.getByRole("button", { name:"Clear selection", exact:true }).click();
  const filter = page.getByRole("textbox", { name:"Filter by description" });
  await filter.fill("no matching component xyz");
  await figure(page).getByRole("button", { name:new RegExp(`^Callout ${fixture.ref}:`) }).first().click();
  await expect(page.getByText("Selected part is outside these filters", { exact:true })).toBeVisible();
  await expect(page.locator(`tr[data-figure-part-id="${exactRow}"]`)).toHaveCount(1);
  await expect(filter).toHaveValue("no matching component xyz");
  await info.attach("selected-row.png", { body:await page.screenshot(), contentType:"image/png" });
  await page.getByRole("button", { name:"Clear selection", exact:true }).click();
  await expect(page.getByText("Selected part is outside these filters", { exact:true })).toHaveCount(0);
  await info.attach("geometry.json", { body:JSON.stringify(measurements,null,2), contentType:"application/json" });
  expect(errors).toEqual([]);
});

test("synthetic tall PNG: own-container row reveal, union fitting, drag cancellation, transformed picking and reduced motion", async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion:"reduce" });
  await page.goto("http://localhost:3101");
  const scope = figure(page);
  await expect(scope.locator("img")).toBeVisible();
  const measurements = [{ state:"synthetic tall fit", ...await geometry(scope) }];
  const row = page.locator('tr[data-figure-part-id="row-39"]');
  const table = page.locator("table").locator("..");
  await scope.getByRole("button", { name:"Callout 40", exact:true }).click();
  await expect.poll(() => table.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  const visible = await row.evaluate((el) => { const r=el.getBoundingClientRect();const b=el.closest("table")!.parentElement!.getBoundingClientRect();return r.top>=b.top && r.bottom<=b.bottom+1; });
  expect(visible).toBe(true);
  await table.hover();
  const before = await table.evaluate((el) => el.scrollTop);
  await page.mouse.wheel(0,-300);
  await expect.poll(() => table.evaluate((el) => el.scrollTop)).toBeLessThan(before);
  expect(await zoom(scope)).toBe(1);
  for (let i=0;i<4;i++) await page.getByRole("button", { name:"Zoom in", exact:true }).click();
  await settled(page);
  await scope.locator("img").hover({ position:{ x:1, y:1 } });
  await page.mouse.wheel(0,-120);
  expect(await zoom(scope)).toBe(4);
  const sheet = stage(scope).locator("..");
  await sheet.evaluate((el) => { el.scrollTop=0;el.scrollLeft=0; });
  await row.click();
  await expect.poll(() => sheet.evaluate((el) => el.scrollTop)).toBeGreaterThan(500);
  expect(await zoom(scope)).toBe(4);
  measurements.push({ state:"synthetic tall revealed zoom", ...await geometry(scope) });
  // Explicit reveal also restores a deliberately displaced viewport at 4x.
  await sheet.evaluate((el) => { el.scrollTop=0;el.scrollLeft=0; });
  await page.getByRole("button", { name:"Show selected part", exact:true }).click();
  await expect.poll(() => sheet.evaluate((el) => el.scrollTop)).toBeGreaterThan(500);
  expect(await zoom(scope)).toBe(4);
  await page.locator('tr[data-figure-part-id="row-1"]').click();
  await expect.poll(() => zoom(scope)).toBe(1);
  await expect.poll(() => scope.locator('path[data-selected]').evaluate((path) => {
    const rect=path.getBoundingClientRect();const sheet=path.closest("svg")!.parentElement!.parentElement!;const box=sheet.getBoundingClientRect();
    return rect.left>=box.left-1 && rect.top>=box.top-1 && rect.right<=box.right+1 && rect.bottom<=box.bottom+1;
  })).toBe(true);
  await page.getByRole("button", { name:"Clear selection", exact:true }).click();
  await page.getByRole("button", { name:"Zoom in", exact:true }).click();
  await settled(page);
  // Native mouse drag crosses threshold, so the closing click cannot select.
  const point = await componentPoint(scope);
  expect(point).not.toBeNull();
  await page.mouse.move(point!.x,point!.y);await page.mouse.down();await page.mouse.move(point!.x+30,point!.y+20,{ steps:5 });await page.mouse.up();
  await expect(scope.locator('path[data-selected]')).toHaveCount(0);
  await scope.getByRole("button", { name:"Callout 40", exact:true }).click();
  await expect(scope.getByRole("button", { name:"Callout 40", exact:true })).toHaveAttribute("aria-pressed","true");
  await page.getByRole("button", { name:"Zoom out", exact:true }).click();
  await page.getByRole("button", { name:"Clear selection", exact:true }).click();
  await scope.locator("img").hover({ position:{ x:1, y:1 } });
  await page.mouse.wheel(0,120);
  expect(await zoom(scope)).toBe(1);
  // Browser input protocol generates trusted touch/pointer cancellation;
  // no dispatchEvent or synthetic DOM PointerEvent is used for this gate.
  const cancellationPoint = await componentPoint(scope);
  expect(cancellationPoint).not.toBeNull();
  const input = await page.context().newCDPSession(page);
  await input.send("Input.dispatchTouchEvent", { type:"touchStart", touchPoints:[{ x:cancellationPoint!.x, y:cancellationPoint!.y }] });
  await input.send("Input.dispatchTouchEvent", { type:"touchCancel", touchPoints:[] });
  await input.detach();
  await expect(scope.locator('path[data-selected]')).toHaveCount(0);
  await scope.getByRole("button", { name:"Callout 40", exact:true }).click();
  await expect(scope.getByRole("button", { name:"Callout 40", exact:true })).toHaveAttribute("aria-pressed","true");
  await page.getByRole("button", { name:"Clear selection", exact:true }).click();
  // Apply a test-only ancestor transform to image and SVG together, then pick
  // a point using genuine browser input and the live SVG screen transform.
  await stage(scope).evaluate((el) => { (el as HTMLElement).style.transform="rotate(7deg) scale(0.85)"; });
  const transformed = await componentPoint(scope);
  expect(transformed).not.toBeNull();
  await page.mouse.click(transformed!.x,transformed!.y);
  const chooser = page.getByRole("group", { name:"Choose overlapping component" });
  if (await chooser.count()) await chooser.getByRole("button").first().click();
  await expect(scope.getByRole("button", { name:transformed!.label, exact:true })).toHaveAttribute("aria-pressed","true");
  expect(await stage(scope).evaluate((el) => getComputedStyle(el).transitionDuration)).toBe("0s");
  await info.attach("synthetic-geometry.json", { body:JSON.stringify(measurements,null,2), contentType:"application/json" });
  await info.attach("synthetic-tall.png", { body:await page.screenshot(), contentType:"image/png" });
});
