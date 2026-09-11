import { expect, test } from "vitest";
import { pointInRegion } from "@rufdiamond/contracts/diagram-geometry";
import { proposalRegions, splitRetracedBridge } from "@/lib/proposal-geometry";
import type { ImagePoint } from "@rufdiamond/contracts";

const bridge: ImagePoint[] = [[10,10],[90,10],[90,90],[10,90],[10,10],[30,30],[30,70],[70,70],[70,30],[30,30]];
test("exact retraced closure becomes a hole without moving vertices", () => {
  const split = splitRetracedBridge(bridge, 4);
  expect(split).toEqual({ outer: [[10,10],[90,10],[90,90],[10,90]], holes: [[[30,30],[30,70],[70,70],[70,30]]] });
  expect(bridge).toHaveLength(10);
  const region = { id: "r", ...split! };
  expect(pointInRegion([20,50], region)).toBe(true);
  for (const point of [[50,50],[30,50],[30,30],[5,5]] as ImagePoint[]) expect(pointInRegion(point, region)).toBe(false);
});
test("a proper crossing, unclosed bridge, exterior or touching hole cannot be repaired", () => {
  const crossing: ImagePoint[] = [[10,10],[90,90],[10,90],[90,10]];
  expect(splitRetracedBridge(crossing, 4)).toBeNull();
  for (const change of [
    (p: ImagePoint[]) => { p[4] = [10.01,10]; },
    (p: ImagePoint[]) => { p[9] = [30.01,30]; },
    (p: ImagePoint[]) => { p[5] = p[9] = [95,30]; },
    (p: ImagePoint[]) => { p[5] = p[9] = [10,30]; },
    (p: ImagePoint[]) => { p[1] = [90,90]; p[2] = [90,10]; },
  ]) { const p = structuredClone(bridge); change(p); expect(splitRetracedBridge(p, 4)).toBeNull(); }
});
test("percentage outer/hole ownership and disjoint rings survive source-pixel conversion", () => {
  const regions = proposalRegions({calloutId:"c", polygons:[[[10,10],[90,10],[90,90],[10,90]],[[1,1],[5,1],[5,5]]], holes:[[[[30,30],[30,70],[70,70],[70,30]]],[]]},1280,720);
  expect(regions).toHaveLength(2);
  expect(regions[0]).toMatchObject({outer:[[128,72],[1152,72],[1152,648],[128,648]],holes:[[[384,216],[384,504],[896,504],[896,216]]]});
  expect(regions[1].outer).toEqual([[12.8,7.2],[64,7.2],[64,36]]);
  expect(regions[1].holes).toEqual([]);
});
