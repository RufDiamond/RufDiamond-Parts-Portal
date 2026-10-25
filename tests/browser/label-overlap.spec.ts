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

async function selectedBadgeProblems(scope: Locator) {
  return scope.evaluate(figure => {
    const image = figure.querySelector("img");
    const plate = image?.getBoundingClientRect();
    const sheet = image?.parentElement?.parentElement;
    const clip = sheet?.getBoundingClientRect();
    const visiblePlate = plate && clip && sheet ? {
      left: Math.max(plate.left, clip.left + sheet.clientLeft),
      right: Math.min(plate.right, clip.left + sheet.clientLeft + sheet.clientWidth),
      top: Math.max(plate.top, clip.top + sheet.clientTop),
      bottom: Math.min(plate.bottom, clip.top + sheet.clientTop + sheet.clientHeight),
    } : plate;
    const badges = Array.from(figure.querySelectorAll<HTMLElement>("button[data-selected-part-number]"));
    const problems: string[] = [];
    const numbers = badges.map(badge => badge.dataset.selectedPartNumber);
    if (new Set(numbers).size !== numbers.length) problems.push("duplicate selected part number");
    for (const [i, badge] of badges.entries()) {
      const box = badge.getBoundingClientRect();
      if (visiblePlate && Math.min(box.right,visiblePlate.right)-Math.max(box.left,visiblePlate.left)>0.75 &&
        Math.min(box.bottom,visiblePlate.bottom)-Math.max(box.top,visiblePlate.top)>0.75) problems.push(`${numbers[i]} badge overlaps artwork`);
      const strip = badge.parentElement!;
      const stripBox = strip.getBoundingClientRect();
      const stripStyle = getComputedStyle(strip);
      const stripLeft = stripBox.left + strip.clientLeft + parseFloat(stripStyle.paddingLeft);
      const stripRight = stripBox.left + strip.clientLeft + strip.clientWidth - parseFloat(stripStyle.paddingRight);
      if (box.left < stripLeft - 0.75 || box.right > stripRight + 0.75) problems.push(`${numbers[i]} badge exceeds strip width`);
      for (let ancestor = strip.parentElement; ancestor; ancestor = ancestor.parentElement) {
        if (!/(auto|scroll|hidden|clip)/.test(getComputedStyle(ancestor).overflowX)) continue;
        const clipped = ancestor.getBoundingClientRect();
        const left = clipped.left + ancestor.clientLeft;
        const right = left + ancestor.clientWidth;
        if (box.left < left - 0.75 || box.right > right + 0.75) problems.push(`${numbers[i]} badge clipped by drawing panel`);
      }
      for (const child of badge.children) {
        const text = child.getBoundingClientRect();
        if (text.left < box.left - 0.75 || text.right > box.right + 0.75 ||
          child.scrollWidth > child.clientWidth + 1) problems.push(`${numbers[i]} text exceeds badge width`);
      }
      for (const other of badges.slice(i + 1)) {
        const next = other.getBoundingClientRect();
        if (Math.min(box.right,next.right)-Math.max(box.left,next.left)>0.75 &&
          Math.min(box.bottom,next.bottom)-Math.max(box.top,next.top)>0.75) problems.push("selected badges overlap");
      }
    }
    for (const marker of figure.querySelectorAll('button[data-callout-id][aria-pressed="true"]')) {
      if (badges.some(badge => getComputedStyle(badge).backgroundColor === getComputedStyle(marker).backgroundColor)) {
        problems.push("selected reference repeats badge highlight");
      }
    }
    return problems;
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
      if (["fig-frame-assy-2-1", "fig-cabin-6-13", "fig-cabin-6-15"].includes(entry.id)) {
        // Source rows without mapped artwork still need a single removable badge.
        const missing = await figure.evaluate(plate => {
          const mapped = Array.from(plate.querySelectorAll("button[data-callout-id]"), marker => marker.getAttribute("title") ?? "");
          const rows = Array.from(document.querySelectorAll("tr[data-figure-part-id]"));
          return rows.map((row,index) => ({ index,
            number: row.querySelector('input[type="checkbox"]')?.getAttribute("aria-label")?.replace(/^Select /, "").replace(/ on the drawing$/, ""),
          })).find(row => row.number && !mapped.some(title => title.startsWith(`${row.number} — `)));
        });
        expect(missing, `${entry.id} needs an unmapped source row`).toBeTruthy();
        const sourceRow = page.locator("tr[data-figure-part-id]").nth(missing!.index);
        await sourceRow.click();
        const badge = figure.getByRole("button", {name:`Deselect part ${missing!.number}`, exact:true});
        await expect(badge).toContainText("No mapped highlight");
        await expect(figure.locator("button[data-selected-part-number]")).toHaveCount(1);
        await expect.poll(() => selectedBadgeProblems(figure)).toEqual([]);
        await page.getByRole("button", {name:"Illustration full screen", exact:true}).click();
        const full = page.getByRole("dialog");
        await expect(full.getByRole("button", {name:`Deselect part ${missing!.number}`, exact:true})).toContainText("No mapped highlight");
        await expect.poll(() => selectedBadgeProblems(full.locator("figure"))).toEqual([]);
        await full.getByRole("button", {name:`Deselect part ${missing!.number}`, exact:true}).click();
        await expect(full.locator("button[data-selected-part-number]")).toHaveCount(0);
        await page.getByRole("button", {name:"Close the illustration"}).click();
        await expect(sourceRow).not.toHaveAttribute("data-active");
      }
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
        await expect(figure.locator("button[data-selected-part-number]")).toHaveCount(1);
        await expect.poll(() => selectedBadgeProblems(figure)).toEqual([]);
        // Focus/hover on a selected occurrence must keep the same single badge.
        await marker.focus();
        await expect.poll(() => selectedBadgeProblems(figure)).toEqual([]);
        await expect.poll(() => collisions(figure)).toEqual([]);
        if (screen.name === "desktop") await marker.click();
        else await marker.tap();
        await page.mouse.move(0,0);
        await expect(marker).toHaveAttribute("aria-pressed","false");
        await expect(figure.locator("button[data-selected-part-number]")).toHaveCount(0);
      }
      // Keep a multi-occurrence part selected through zoom/fullscreen where available.
      if (ids.length) {
        const shared = await figure.locator("button[data-callout-id]").evaluateAll(markers => {
          const groups = new Map<string, string[]>();
          for (const marker of markers) {
            const part = marker.getAttribute("title") ?? marker.getAttribute("aria-label") ?? "";
            groups.set(part, [...(groups.get(part) ?? []), marker.getAttribute("data-callout-id")!]);
          }
          return [...groups.values()].sort((a,b) => b.length-a.length)[0][0];
        });
        const marker = figure.locator(`button[data-callout-id="${shared}"]`);
        if (screen.name === "desktop") await marker.click();
        else await marker.tap();
        await expect(figure.locator("button[data-selected-part-number]")).toHaveCount(1);
      }
      const fitWidth = await image.evaluate(el => el.getBoundingClientRect().width);
      await page.getByRole("button",{name:"Zoom in",exact:true}).click();
      await expect.poll(() => image.evaluate(el => el.getBoundingClientRect().width)).toBeGreaterThan(fitWidth * 1.1);
      await expect.poll(() => collisions(figure), {message:`${entry.id} zoomed`}).toEqual([]);
      await expect.poll(() => selectedBadgeProblems(figure)).toEqual([]);
      if (entry.id === "fig-tire-wheel-5-1") await page.screenshot({path:info.outputPath(`${screen.name}-wheel-selected-zoomed.png`)});
      await page.getByRole("button",{name:"Illustration full screen",exact:true}).click();
      const dialog=page.getByRole("dialog");
      await expect.poll(() => collisions(dialog.locator("figure")), {message:`${entry.id} fullscreen`}).toEqual([]);
      await expect(dialog.locator("button[data-selected-part-number]")).toHaveCount(ids.length ? 1 : 0);
      await expect.poll(() => selectedBadgeProblems(dialog.locator("figure"))).toEqual([]);
      if (["fig-frame-assy-2-1", "fig-tire-wheel-5-1"].includes(entry.id)) await page.screenshot({path:info.outputPath(`${screen.name}-${entry.id}-fullscreen.png`)});
      if (ids.length) {
        await dialog.locator("button[data-selected-part-number]").click();
        await expect(dialog.locator('button[data-callout-id][aria-pressed="true"]')).toHaveCount(0);
        await expect(dialog.locator("button[data-selected-part-number]")).toHaveCount(0);
      }
      await page.getByRole("button",{name:"Close the illustration"}).click();
      expect(errors).toEqual([]);
      const overflow=await page.evaluate(() => document.documentElement.scrollWidth-innerWidth);
      expect(overflow,`${entry.id} page horizontal overflow`).toBeLessThanOrEqual(1);
    });
  });
}
