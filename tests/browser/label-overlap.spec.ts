import { expect, test, type Locator } from "@playwright/test";
import { figures } from "../../src/data/ft3-wagon";

async function collisions(scope: Locator) {
  return scope.locator("button[data-callout-id]").evaluateAll(elements => {
    const inset = matchMedia("(pointer: coarse)").matches ? 8 : 0;
    const boxes = elements.map(el => ({ id: el.getAttribute("data-callout-id"), r: el.getBoundingClientRect() }));
    const overlaps: string[] = [];
    for (let i=0;i<boxes.length;i++) for (let j=i+1;j<boxes.length;j++) {
      const a=boxes[i],b=boxes[j];
      if (Math.min(a.r.right,b.r.right)-Math.max(a.r.left,b.r.left)+2*inset>0.75 &&
        Math.min(a.r.bottom,b.r.bottom)-Math.max(a.r.top,b.r.top)+2*inset>0.75) overlaps.push(`${a.id}/${b.id}`);
    }
    return overlaps;
  });
}

async function highlightedReferences(scope: Locator) {
  return scope.evaluate(figure => {
    const sample = document.createElement("span");
    sample.style.backgroundColor = "var(--select)";
    figure.appendChild(sample);
    const selectedColor = getComputedStyle(sample).backgroundColor;
    sample.remove();
    return Array.from(figure.querySelectorAll("button[data-callout-id]"))
      .filter(marker => getComputedStyle(marker).backgroundColor === selectedColor).length;
  });
}

for (const screen of [
  {name:"desktop",width:1440,height:1000},
  {name:"tablet",width:1024,height:768},
  {name:"mobile",width:390,height:844},
]) {
  test.describe(screen.name, () => {
    test.use({viewport:{width:screen.width,height:screen.height}, hasTouch:screen.name !== "desktop", isMobile:screen.name === "mobile"});
    for (const entry of figures) test(`${entry.id}: fit, mouse selection, zoom and fullscreen have no label collisions`, async ({page}, info) => {
      const errors: string[] = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.goto(`/figures/${entry.id}`);
      const figure = page.locator("figure").first();
      await expect(figure).toBeVisible();
      await expect(page.locator("tr[data-figure-part-id]").first()).toBeAttached();
      const image=figure.locator("img");
      if (entry.id === "fig-cabin-6-15") {
        await expect(image).toHaveCount(0);
        await expect(figure.locator("button[data-callout-id]")).toHaveCount(0);
        expect(errors).toEqual([]);
        return;
      }
      await expect.poll(() => image.evaluate(el => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
      await expect.poll(() => collisions(figure), {message:`${entry.id} initial fit`}).toEqual([]);
      const ids = await figure.locator("button[data-callout-id]").evaluateAll(els => els.map(el=>el.getAttribute("data-callout-id")!));
      if (entry.id !== "fig-cabin-6-13") expect(ids.length).toBeGreaterThan(0);
      const clicked = screen.name === "desktop" ? ids : ids.filter((_,i)=>i===0 || i===Math.floor(ids.length/2) || i===ids.length-1);
      for (const id of clicked) {
        const marker=figure.locator(`button[data-callout-id="${id}"]`);
        if (screen.name === "desktop") await marker.click();
        else await marker.tap(); // Exercise actual touch targets.
        await page.mouse.move(0,0);
        await expect(marker).toHaveAttribute("aria-pressed","true");
        await expect(page.locator("tr[data-active]").first()).toBeAttached();
        await expect.poll(() => highlightedReferences(figure)).toBe(1);
        await expect(figure.getByRole("group", { name: "Selected parts" })).toHaveCount(0);
        await expect.poll(() => collisions(figure)).toEqual([]);
        if (screen.name === "desktop") await marker.click();
        else await marker.tap();
        await page.mouse.move(0,0);
        await expect(marker).toHaveAttribute("aria-pressed","false");
      }
      const fitWidth = await image.evaluate(el => el.getBoundingClientRect().width);
      await page.getByRole("button",{name:"Zoom in",exact:true}).click();
      await expect.poll(() => image.evaluate(el => el.getBoundingClientRect().width)).toBeGreaterThan(fitWidth * 1.1);
      await expect.poll(() => collisions(figure), {message:`${entry.id} zoomed`}).toEqual([]);
      if (ids.length) {
        await figure.locator(`button[data-callout-id="${ids[0]}"]`).click();
        await page.mouse.move(0,0);
        await expect.poll(() => highlightedReferences(figure)).toBe(1);
      }
      await page.getByRole("button",{name:"Illustration full screen",exact:true}).click();
      const dialog=page.getByRole("dialog");
      await expect.poll(() => collisions(dialog.locator("figure")), {message:`${entry.id} fullscreen`}).toEqual([]);
      if (ids.length) await expect.poll(() => highlightedReferences(dialog.locator("figure"))).toBe(1);
      await expect(dialog.getByRole("group", { name: "Selected parts" })).toHaveCount(0);
      if (entry.id === "fig-frame-assy-2-1") await page.screenshot({path:info.outputPath(`${screen.name}-bumper-fullscreen.png`)});
      await page.getByRole("button",{name:"Close the illustration"}).click();
      expect(errors).toEqual([]);
      const overflow=await page.evaluate(() => document.documentElement.scrollWidth-innerWidth);
      expect(overflow,`${entry.id} page horizontal overflow`).toBeLessThanOrEqual(1);
    });
  });
}
