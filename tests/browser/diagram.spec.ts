import { expect, test, type Locator, type Page } from "@playwright/test";

const base = process.env.DIAGRAM_BASE_URL ?? "http://localhost:3100";
const cases = [
  { name:"Windows", route:"/figures/fig-cabin-6-1", ref:2 },
  { name:"Filters", route:"/figures/fig-filters-1-1", ref:1 },
  { name:"corrected bumper", route:"/review/figures/fig-frame-assy-2-1", ref:1 },
  { name:"Hydraulic 4.4", route:"/review/figures/fig-hydraulic-4-4", ref:1 },
  { name:"task10c Filters contours", route:"/review/figures/fig-filters-1-1", ref:1 },
  { name:"task10c Engine 8.6 corrected contour", route:"/review/figures/fig-engine-8-6", ref:1 },
  { name:"task10c Wheel 5.1 hole", route:"/review/figures/fig-tire-wheel-5-1", ref:1 },
  { name:"task10c Electrical 11.5 hole", route:"/review/figures/fig-electric-11-5", ref:8 },
  { name:"task10c Inflation 10.1 hole", route:"/review/figures/fig-tire-inflation-10-1", ref:12 },
  { name:"task10c Hydraulic 4.3 shroud", route:"/review/figures/fig-hydraulic-4-3", ref:2 },
  { name:"task10c Cabin 6.4 hinge", route:"/review/figures/fig-cabin-6-4", ref:7 },
  { name:"task10c Cabin 6.5 hinge", route:"/review/figures/fig-cabin-6-5", ref:7 },
];

test("task10c source openings exclude clicks in both Bumper plates and the four converted rings", async ({page},info) => {
  const checks = [
    {figure:"fig-hydraulic-4-3",ref:2,hole:[510,433]},
    {figure:"fig-hydraulic-4-3",ref:2,hole:[738,475]},
    {figure:"fig-cabin-6-4",ref:7,hole:[980,285]},
    {figure:"fig-cabin-6-5",ref:7,hole:[935,348]},
    {figure:"fig-frame-assy-2-1",ref:5,hole:[397,359]},
    {figure:"fig-frame-assy-2-2",ref:3,hole:[674,447]},
    {figure:"fig-frame-assy-2-2",ref:5,hole:[481,400]},
    {figure:"fig-tire-wheel-5-1",ref:1,hole:[630,450]},
    {figure:"fig-tire-wheel-5-1",ref:6,hole:[137,580]},
    {figure:"fig-electric-11-5",ref:8,hole:[1008,666]},
    {figure:"fig-tire-inflation-10-1",ref:12,hole:[571,65]},
  ];
  for (const check of checks) {
    await page.goto(`${base}/review/figures/${check.figure}`);
    await page.getByRole("button",{name:"Illustration full screen",exact:true}).click();
    const dialog=page.getByRole("dialog"), scope=dialog.locator("figure");
    await scope.getByRole("button",{name:new RegExp(`^Callout ${check.ref}:`)}).click();
    await page.mouse.move(0,0);
    await expect(dialog.getByText(/unapproved.*not for ordering/i)).toBeVisible();
    await page.screenshot({path:info.outputPath(`${check.figure}-ref${check.ref}-overlay.png`)});
    await dialog.getByRole("button",{name:"Clear selection",exact:true}).click();
    const p=await scope.locator("svg[data-diagram-regions]").evaluate((el,hole)=>{
      const p=new DOMPoint(hole[0],hole[1]).matrixTransform((el as SVGSVGElement).getScreenCTM()!);
      return {x:Math.round(p.x),y:Math.round(p.y)};
    },check.hole);
    await page.mouse.click(p.x,p.y);await page.mouse.move(0,0);
    await expect(scope.getByRole("button",{name:new RegExp(`^Callout ${check.ref}:`)})).toHaveAttribute("aria-pressed","false");
    await page.getByRole("button",{name:"Close the illustration"}).click();
  }
});

test("task10c detailed added contours converge through physical click, label and row", async ({page},info) => {
  test.setTimeout(180000);
  for (const entry of [
    {figure:"fig-filters-1-1",refs:[1,2,3,4,5,6]},
    {figure:"fig-hydraulic-4-2",refs:[1,2,3,4]},
    {figure:"fig-hydraulic-4-3",refs:[2]},
    {figure:"fig-cabin-6-4",refs:[7]},
    {figure:"fig-cabin-6-5",refs:[7]},
    {figure:"fig-cabin-6-11",refs:[2,4,9,10]},
    {figure:"fig-engine-8-1",refs:[1,2]},
    {figure:"fig-cowling-fender-7-1",refs:[14,15,16,18,19,29,31,32,33]},
    {figure:"fig-hydraulic-4-1",refs:[19,20,21,22,23,24,25,26]},
    {figure:"fig-cabin-6-6",refs:[7,14]},
    {figure:"fig-cabin-6-18",refs:[5,6,7,8]},
  ]) {
    await page.goto(`${base}/review/figures/${entry.figure}`);
    for (const ref of entry.refs) {
      const label=figure(page).getByRole("button",{name:new RegExp(`^Callout ${ref}:`)});
      await label.click();await page.mouse.move(0,0);
      const row=page.locator("tr[data-figure-part-id][data-active]").first();
      await expect(row).toBeVisible();
      await row.click();await page.mouse.move(0,0);
      await expect(label).toHaveAttribute("aria-pressed","true");
      await page.getByRole("button",{name:"Illustration full screen",exact:true}).click();
      const dialog=page.getByRole("dialog"),scope=dialog.locator("figure");
      await page.screenshot({path:info.outputPath(`${entry.figure}-ref${ref}-overlay.png`)});
      const zoomIn=dialog.getByRole("button",{name:"Zoom in",exact:true});
      for(let i=0;i<4 && await zoomIn.isEnabled();i++) await zoomIn.click();
      await dialog.getByRole("button",{name:"Clear selection",exact:true}).click();
      await scope.locator(`svg[data-diagram-regions] path[aria-label^="Component ${ref}:"]`).first().scrollIntoViewIfNeeded();
      await settled(page);
      const p=await componentPoint(scope,ref);
      expect(p,`${entry.figure}/${ref} has a usable visible physical pixel at zoom`).not.toBeNull();
      await page.mouse.click(p!.x,p!.y);await page.mouse.move(0,0);
      const chooser=page.getByRole("group",{name:"Choose overlapping component"});
      if(await chooser.count()) await chooser.getByRole("button",{name:new RegExp(`^Ref ${ref} `)}).click();
      await expect(scope.getByRole("button",{name:new RegExp(`^Callout ${ref}:`)})).toHaveAttribute("aria-pressed","true");
      await page.getByRole("button",{name:"Close the illustration"}).click();
    }
  }
});
const figure = (page:Page) => page.locator("figure").first();
const stage = (scope:Locator) => scope.locator("img").locator("..");

test("fullscreen text actions wrap and retain keyboard selection controls on a narrow viewport", async ({ page }) => {
  await page.goto(base + "/figures/fig-cabin-6-1");
  await figure(page).getByRole("button", { name: /^Callout 2:/ }).first().click();
  await page.getByRole("button", { name: "Illustration full screen", exact: true }).click();
  const desktopAction = page.getByRole("dialog").getByRole("button", { name: "Show selected part", exact: true });
  expect(await desktopAction.evaluate(el => el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(36);
  await page.setViewportSize({ width: 360, height: 760 });
  const dialog = page.getByRole("dialog");
  const show = dialog.getByRole("button", { name: "Show selected part", exact: true });
  const clear = dialog.getByRole("button", { name: "Clear selection", exact: true });
  const dimensions = await show.evaluate(el => ({ height: el.getBoundingClientRect().height, width: el.getBoundingClientRect().width, parentWidth: el.parentElement!.getBoundingClientRect().width, parentScroll: el.parentElement!.scrollWidth }));
  expect(dimensions.height).toBeGreaterThanOrEqual(36);
  expect(dimensions.width).toBeGreaterThan(70);
  expect(dimensions.parentScroll).toBeLessThanOrEqual(dimensions.parentWidth + 1);
  await show.focus(); await page.keyboard.press("Enter");
  await clear.focus(); await page.keyboard.press("Enter");
  await expect(show).toBeDisabled();
});

test("synthetic editor: native coordinates, drag, keyboard, zoom and image mismatch gate", async ({ page }, info) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await page.goto("http://localhost:3101");
  const png = await page.evaluate(() => {
    const canvas = document.createElement("canvas"); canvas.width = 640; canvas.height = 480;
    const context = canvas.getContext("2d")!; context.fillStyle = "white"; context.fillRect(0, 0, 640, 480); context.strokeRect(100, 100, 100, 100);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  await page.route("**/synthetic-editor.png", route => route.fulfill({ contentType: "image/png", body: Buffer.from(png, "base64") }));
  await page.goto("http://localhost:3101/?editor");
  await expect(page.getByRole("button", { name: "Polygon (G)" })).toBeEnabled();
  const svg = page.getByTestId("mapping-canvas");
  const nativePoint = (x: number, y: number) => svg.evaluate((el, p) => {
    const result = new DOMPoint(p.x, p.y).matrixTransform((el as SVGSVGElement).getScreenCTM()!); return { x: result.x, y: result.y };
  }, { x, y });
  await svg.focus(); await page.keyboard.press("g");
  for (const [x, y] of [[100, 100], [200, 100], [200, 200], [100, 200]]) { const p = await nativePoint(x, y); await page.mouse.click(p.x, p.y); }
  await page.keyboard.press("Enter"); await page.keyboard.press("v");
  const p = await nativePoint(150, 150); await page.mouse.click(p.x, p.y);
  const vertex = page.getByRole("button", { name: "Outer vertex 1" });
  const start = await nativePoint(100, 100); const end = await nativePoint(110, 120);
  await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(end.x, end.y, { steps: 5 }); await page.mouse.up();
  await expect.poll(async () => Number(await vertex.getAttribute("cx"))).toBeCloseTo(110, 0);
  await expect.poll(async () => Number(await vertex.getAttribute("cy"))).toBeCloseTo(120, 0);
  await vertex.focus(); await page.keyboard.press("ArrowRight");
  await expect.poll(async () => Number(await vertex.getAttribute("cx"))).toBeCloseTo(111, 0);
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  const alignment = await svg.evaluate(el => {
    const image = el.parentElement!.querySelector("img")!.getBoundingClientRect(); const overlay = el.getBoundingClientRect();
    return Math.max(...["left", "top", "width", "height"].map(k => Math.abs(image[k as keyof DOMRect] as number - (overlay[k as keyof DOMRect] as number))));
  });
  expect(alignment).toBeLessThanOrEqual(1);
  await page.screenshot({ path: info.outputPath("synthetic-editor.png"), fullPage: true });
  await info.attach("geometry", { body: JSON.stringify({ maximumImageOverlayError: alignment, expectedMovedVertex: [111, 120] }), contentType: "application/json" });
  await page.goto("http://localhost:3101/?editor&mismatch");
  await expect(page.getByRole("button", { name: "Polygon (G)" })).toBeDisabled(); await expect(svg).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("synthetic editor portrait: Fit drawing contains both dimensions after zoom, pan and resize", async ({ page }, info) => {
  await page.goto("http://localhost:3101");
  const png = await page.evaluate(() => {
    const canvas = document.createElement("canvas"); canvas.width = 400; canvas.height = 1000;
    const context = canvas.getContext("2d")!; context.fillStyle = "white"; context.fillRect(0, 0, 400, 1000); context.strokeRect(5, 5, 390, 990);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  await page.route("**/synthetic-editor.png", route => route.fulfill({ contentType: "image/png", body: Buffer.from(png, "base64") }));
  await page.goto("http://localhost:3101/?editor&portrait");
  await expect(page.getByRole("button", { name: "Pan (P)" })).toBeEnabled();
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await page.getByRole("button", { name: "Pan (P)" }).click();
  const svg = page.getByTestId("mapping-canvas");
  const box = await svg.boundingBox();
  await page.mouse.move(box!.x + box!.width / 2, 550); await page.mouse.down(); await page.mouse.move(box!.x + box!.width / 2 + 50, 580); await page.mouse.up();
  await page.getByRole("button", { name: "Fit drawing" }).click();
  const measurements = [];
  for (const size of [{ width: 1440, height: 1000 }, { width: 800, height: 800 }]) {
    await page.setViewportSize(size);
    const fit = await svg.evaluate(el => {
      const image = el.parentElement!.querySelector("img")!.getBoundingClientRect();
      const viewport = el.parentElement!.parentElement!.getBoundingClientRect();
      const overlay = el.getBoundingClientRect();
      return { width: image.width, height: image.height, overflow: Math.max(0, viewport.left - image.left, viewport.top - image.top, image.right - viewport.right, image.bottom - viewport.bottom), overlayError: Math.max(Math.abs(image.width - overlay.width), Math.abs(image.height - overlay.height)) };
    });
    expect(fit.width).toBeGreaterThan(0); expect(fit.height / fit.width).toBeCloseTo(2.5, 2);
    expect(fit.overflow).toBeLessThanOrEqual(1); expect(fit.overlayError).toBeLessThanOrEqual(1); measurements.push({ ...size, ...fit });
  }
  await page.screenshot({ path: info.outputPath("synthetic-editor-portrait-fit.png"), fullPage: true });
  await info.attach("portrait-fit", { body: JSON.stringify(measurements), contentType: "application/json" });
});
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

async function componentPoint(scope:Locator, ref?:number) {
  return scope.locator(ref === undefined ? "svg[data-diagram-regions] path" : `svg[data-diagram-regions] path[aria-label^="Component ${ref}:"]`).evaluateAll((paths) => {
    for (const element of paths) {
      const path = element as SVGGeometryElement;
      const b = path.getBBox();
      for (let i=1;i<10;i++) for (let j=1;j<10;j++) {
        const point = new DOMPoint(b.x+b.width*i/10, b.y+b.height*j/10);
        if (!path.isPointInFill(point)) continue;
        const matrix = path.getScreenCTM()!;
        const screen = point.matrixTransform(matrix);
        // Trusted mouse click coordinates are integer CSS pixels. Recheck the
        // actual delivered point, especially for thin physical ring bands.
        const x = Math.round(screen.x), y = Math.round(screen.y);
        const delivered = new DOMPoint(x,y).matrixTransform(matrix.inverse());
        if (path.isPointInFill(delivered) && document.elementFromPoint(x, y) === path) return { x, y, label:path.getAttribute("aria-label")! };
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
  if (fixture.name.startsWith("task10c")) {
    await figure(page).screenshot({ path:info.outputPath("source-overlay.png") });
    await label.click(); await page.mouse.move(0,0);
    await expect(label).toHaveAttribute("aria-pressed","true");
    for (let i=0;i<4;i++) await page.getByRole("button", {name:"Zoom in",exact:true}).click();
    await page.getByRole("button", {name:"Show selected part",exact:true}).click();
    await settled(page);
    await page.getByRole("button", { name:"Clear selection", exact:true }).click();
    await expect(label).toHaveAttribute("aria-pressed","false");
    await figure(page).locator(`svg[data-diagram-regions] path[aria-label^="Component ${fixture.ref}:"]`).first().scrollIntoViewIfNeeded();
    const point = await componentPoint(figure(page), fixture.ref);
    expect(point).not.toBeNull();
    await info.attach("native-component-point.json", {body:JSON.stringify(point),contentType:"application/json"});
    await page.mouse.click(point!.x,point!.y); await page.mouse.move(0,0);
    const chooser = page.getByRole("group", {name:"Choose overlapping component"});
    if (await chooser.count()) await chooser.getByRole("button").first().click();
    for (const selected of await figure(page).getByRole("button", {name:point!.label,exact:true}).all()) await expect(selected).toHaveAttribute("aria-pressed","true");
    await label.click(); await page.mouse.move(0,0);
    const zoomOut = page.getByRole("button", {name:"Zoom out",exact:true});
    for (let i=0;i<4 && await zoomOut.isEnabled();i++) await zoomOut.click();
    await settled(page);
  }
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
  await expect.poll(() => zoom(scope)).toBe(4);
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
  await expect.poll(() => zoom(scope)).toBe(1);
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

test("mixed occurrence union reveals numeric, legacy shape and marker together without counting lower-priority fallbacks", async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion:"reduce" });
  await page.goto("http://localhost:3101/?mixed");
  const scope = figure(page);
  await expect(scope.locator("img")).toBeVisible();
  for (let i=0;i<4;i++) await page.getByRole("button", { name:"Zoom in", exact:true }).click();
  await page.locator('tr[data-figure-part-id="row-39"]').click();
  await expect.poll(() => scope.evaluate((root) => {
    const image=root.querySelector("img")!;
    const sheet=image.parentElement!.parentElement!;
    const viewport=sheet.getBoundingClientRect();
    const elements=[root.querySelector('svg[data-diagram-regions] path[data-selected]'),
      root.querySelector('path[data-callout-id="mixed-legacy"]'), root.querySelector('button[data-callout-id="mixed-marker"]')];
    return elements.every((element) => {
      if (!element) return false;
      const box=element.getBoundingClientRect();
      return box.top>=viewport.top-1 && box.left>=viewport.left-1 && box.bottom<=viewport.bottom+1 && box.right<=viewport.right+1;
    });
  })).toBe(true);
  expect(await zoom(scope)).toBe(4);
  await expect(scope.locator('path[data-callout-id="c0"]')).toHaveCount(0);
  await info.attach("mixed-geometry.json", { body:JSON.stringify(await geometry(scope)), contentType:"application/json" });
  await info.attach("mixed-occurrences.png", { body:await page.screenshot(), contentType:"image/png" });
});
