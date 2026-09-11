import { expect, test } from "vitest";
import { revealDelta, revealZoom } from "@/lib/diagram-viewport";

const viewport = { left: 0, top: 0, right: 100, bottom: 100 };
test.each([
  [{ left:20, top:20, right:40, bottom:40 }, { x:0, y:0 }],
  [{ left:20, top:150, right:40, bottom:170 }, { x:0, y:70 }],
  [{ left:20, top:-30, right:40, bottom:-10 }, { x:0, y:-30 }],
  [{ left:-30, top:20, right:-10, bottom:40 }, { x:-30, y:0 }],
  [{ left:150, top:20, right:170, bottom:40 }, { x:70, y:0 }],
  [{ left:-20, top:-20, right:120, bottom:120 }, { x:0, y:0 }],
  [{ left:20, top:20, right:180, bottom:180 }, { x:20, y:20 }],
])("nearest edge reveal for %j", (target, want) => expect(revealDelta(target, viewport)).toEqual(want));

test("keeps zoom when union fits; reduces only as far as required for the whole union", () => {
  expect(revealZoom({ left:0, top:0, right:80, bottom:90 }, viewport, 4)).toBe(4);
  expect(revealZoom({ left:0, top:0, right:180, bottom:90 }, viewport, 4)).toBe(2);
  expect(revealZoom({ left:0, top:0, right:300, bottom:400 }, viewport, 4)).toBe(1);
});
