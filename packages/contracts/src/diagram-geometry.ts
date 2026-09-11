import type {
  ComponentRegion,
  DiagramMappingDocument,
  ImagePoint,
  MappingIssue,
} from "./diagram-mapping.js";

const MAX_OCCURRENCES = 1000;
const MAX_REGIONS_PER_OCCURRENCE = 32;
const MAX_VERTICES_PER_RING = 512;
const MAX_HOLES_PER_REGION = 16;
const MAX_VERTICES_PER_DOCUMENT = 20_000;

type UnknownRecord = Record<string, unknown>;

type ValidatedRing = {
  path: string;
  points: ImagePoint[];
  basicValid: boolean;
  topologyValid: boolean;
};

const issue = (path: string, code: string, message: string): MappingIssue => ({
  path,
  code,
  message,
});

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const samePoint = (left: ImagePoint, right: ImagePoint) =>
  left[0] === right[0] && left[1] === right[1];

const cross = (a: ImagePoint, b: ImagePoint, c: ImagePoint) =>
  (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);

const pointOnSegment = (point: ImagePoint, start: ImagePoint, end: ImagePoint) =>
  cross(start, end, point) === 0 &&
  point[0] >= Math.min(start[0], end[0]) &&
  point[0] <= Math.max(start[0], end[0]) &&
  point[1] >= Math.min(start[1], end[1]) &&
  point[1] <= Math.max(start[1], end[1]);

const orientation = (a: ImagePoint, b: ImagePoint, c: ImagePoint) => {
  const value = cross(a, b, c);
  return value === 0 ? 0 : value > 0 ? 1 : -1;
};

const segmentsIntersect = (
  a: ImagePoint,
  b: ImagePoint,
  c: ImagePoint,
  d: ImagePoint,
) => {
  const abC = orientation(a, b, c);
  const abD = orientation(a, b, d);
  const cdA = orientation(c, d, a);
  const cdB = orientation(c, d, b);

  if (abC !== abD && cdA !== cdB) return true;
  return (
    (abC === 0 && pointOnSegment(c, a, b)) ||
    (abD === 0 && pointOnSegment(d, a, b)) ||
    (cdA === 0 && pointOnSegment(a, c, d)) ||
    (cdB === 0 && pointOnSegment(b, c, d))
  );
};

const ringArea = (ring: ImagePoint[]) => {
  let twiceArea = 0;
  for (let index = 0; index < ring.length; index += 1) {
    const current = ring[index];
    const next = ring[(index + 1) % ring.length];
    twiceArea += current[0] * next[1] - next[0] * current[1];
  }
  return twiceArea / 2;
};

const ringHasSelfIntersection = (ring: ImagePoint[]) => {
  for (let first = 0; first < ring.length; first += 1) {
    const firstNext = (first + 1) % ring.length;
    for (let second = first + 1; second < ring.length; second += 1) {
      const secondNext = (second + 1) % ring.length;
      const adjacent = firstNext === second || secondNext === first;
      if (adjacent) continue;
      if (segmentsIntersect(
        ring[first],
        ring[firstNext],
        ring[second],
        ring[secondNext],
      )) return true;
    }
  }
  return false;
};

const ringsIntersect = (left: ImagePoint[], right: ImagePoint[]) => {
  for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
    const leftNext = (leftIndex + 1) % left.length;
    for (let rightIndex = 0; rightIndex < right.length; rightIndex += 1) {
      const rightNext = (rightIndex + 1) % right.length;
      if (segmentsIntersect(
        left[leftIndex],
        left[leftNext],
        right[rightIndex],
        right[rightNext],
      )) return true;
    }
  }
  return false;
};

const pointInRing = (point: ImagePoint, ring: ImagePoint[]) => {
  let inside = false;
  for (let current = 0, previous = ring.length - 1; current < ring.length; previous = current++) {
    const [currentX, currentY] = ring[current];
    const [previousX, previousY] = ring[previous];
    const crossesRay = (currentY > point[1]) !== (previousY > point[1]);
    if (
      crossesRay &&
      point[0] < ((previousX - currentX) * (point[1] - currentY)) /
        (previousY - currentY) + currentX
    ) {
      inside = !inside;
    }
  }
  return inside;
};

const pointOnRing = (point: ImagePoint, ring: ImagePoint[]) =>
  ring.some((start, index) => pointOnSegment(
    point,
    start,
    ring[(index + 1) % ring.length],
  ));

const validateRing = (
  value: unknown,
  path: string,
  imageWidth: number,
  imageHeight: number,
  skipTopology: boolean,
  issues: MappingIssue[],
): ValidatedRing => {
  if (!Array.isArray(value)) {
    issues.push(issue(path, "invalid_ring", "Ring must be an array of image points"));
    return { path, points: [], basicValid: false, topologyValid: false };
  }

  let basicValid = true;
  const points: ImagePoint[] = [];
  if (value.length < 3) {
    issues.push(issue(path, "too_few_vertices", "Ring must contain at least three vertices"));
    basicValid = false;
  }

  value.forEach((rawPoint, pointIndex) => {
    const pointPath = `${path}[${pointIndex}]`;
    if (!Array.isArray(rawPoint) || rawPoint.length !== 2) {
      issues.push(issue(pointPath, "invalid_point", "Image point must contain exactly two coordinates"));
      basicValid = false;
      return;
    }

    const [x, y] = rawPoint;
    let pointValid = true;
    for (const [coordinateIndex, coordinate] of [x, y].entries()) {
      if (typeof coordinate !== "number" || !Number.isFinite(coordinate)) {
        issues.push(issue(
          `${pointPath}[${coordinateIndex}]`,
          "non_finite_coordinate",
          "Coordinate must be a finite number",
        ));
        pointValid = false;
        basicValid = false;
      }
    }
    if (!pointValid) return;

    const point = [x, y] as ImagePoint;
    points.push(point);
    if (Number.isInteger(imageWidth) && imageWidth > 0 && (x < 0 || x > imageWidth)) {
      issues.push(issue(`${pointPath}[0]`, "point_out_of_bounds", "Coordinate must lie within the source image"));
      basicValid = false;
    }
    if (Number.isInteger(imageHeight) && imageHeight > 0 && (y < 0 || y > imageHeight)) {
      issues.push(issue(`${pointPath}[1]`, "point_out_of_bounds", "Coordinate must lie within the source image"));
      basicValid = false;
    }
  });

  if (points.length === value.length) {
    const distinct = new Set(points.map(([x, y]) => `${x}\u0000${y}`));
    if (distinct.size < 3) {
      issues.push(issue(path, "too_few_distinct_vertices", "Ring must contain at least three distinct vertices"));
      basicValid = false;
    }

    for (let index = 0; index < points.length; index += 1) {
      if (samePoint(points[index], points[(index + 1) % points.length])) {
        issues.push(issue(path, "repeated_adjacent_point", "Adjacent ring vertices must be distinct"));
        basicValid = false;
        break;
      }
    }
  }

  if (!basicValid || skipTopology) {
    return { path, points, basicValid, topologyValid: false };
  }

  let topologyValid = true;
  if (ringArea(points) === 0) {
    issues.push(issue(path, "degenerate_ring", "Ring must enclose a nonzero area"));
    topologyValid = false;
  }
  if (ringHasSelfIntersection(points)) {
    issues.push(issue(path, "self_intersection", "Ring edges must not intersect"));
    topologyValid = false;
  }
  return { path, points, basicValid, topologyValid };
};

const pushLimitIssues = (document: unknown, issues: MappingIssue[]) => {
  if (!isRecord(document) || !Array.isArray(document.occurrences)) return false;

  let exceeded = false;
  let totalVertices = 0;
  if (document.occurrences.length > MAX_OCCURRENCES) {
    issues.push(issue("occurrences", "limit_exceeded", `A document may contain at most ${MAX_OCCURRENCES} occurrences`));
    exceeded = true;
  }

  document.occurrences.forEach((rawOccurrence, occurrenceIndex) => {
    if (!isRecord(rawOccurrence) || !Array.isArray(rawOccurrence.regions)) return;
    const regionsPath = `occurrences[${occurrenceIndex}].regions`;
    if (rawOccurrence.regions.length > MAX_REGIONS_PER_OCCURRENCE) {
      issues.push(issue(regionsPath, "limit_exceeded", `An occurrence may contain at most ${MAX_REGIONS_PER_OCCURRENCE} regions`));
      exceeded = true;
    }

    rawOccurrence.regions.forEach((rawRegion, regionIndex) => {
      if (!isRecord(rawRegion)) return;
      const regionPath = `${regionsPath}[${regionIndex}]`;
      if (Array.isArray(rawRegion.outer)) {
        totalVertices += rawRegion.outer.length;
        if (rawRegion.outer.length > MAX_VERTICES_PER_RING) {
          issues.push(issue(`${regionPath}.outer`, "limit_exceeded", `A ring may contain at most ${MAX_VERTICES_PER_RING} vertices`));
          exceeded = true;
        }
      }
      if (!Array.isArray(rawRegion.holes)) return;
      if (rawRegion.holes.length > MAX_HOLES_PER_REGION) {
        issues.push(issue(`${regionPath}.holes`, "limit_exceeded", `A region may contain at most ${MAX_HOLES_PER_REGION} holes`));
        exceeded = true;
      }
      rawRegion.holes.forEach((rawHole, holeIndex) => {
        if (!Array.isArray(rawHole)) return;
        totalVertices += rawHole.length;
        if (rawHole.length > MAX_VERTICES_PER_RING) {
          issues.push(issue(`${regionPath}.holes[${holeIndex}]`, "limit_exceeded", `A ring may contain at most ${MAX_VERTICES_PER_RING} vertices`));
          exceeded = true;
        }
      });
    });
  });

  if (totalVertices > MAX_VERTICES_PER_DOCUMENT) {
    issues.push(issue("occurrences", "total_vertex_limit_exceeded", `A document may contain at most ${MAX_VERTICES_PER_DOCUMENT} vertices`));
    exceeded = true;
  }
  return exceeded;
};

const validateLabel = (
  value: unknown,
  path: string,
  imageWidth: number,
  imageHeight: number,
  issues: MappingIssue[],
) => {
  if (value === null) return;
  if (!isRecord(value)) {
    issues.push(issue(path, "invalid_label_region", "Label region must be an object or null"));
    return;
  }

  const values = [value.x, value.y, value.width, value.height];
  if (values.some((coordinate) => typeof coordinate !== "number" || !Number.isFinite(coordinate))) {
    issues.push(issue(path, "invalid_label_region", "Label coordinates and dimensions must be finite numbers"));
    return;
  }
  const [x, y, width, height] = values as number[];
  if (
    Number.isInteger(imageWidth) && imageWidth > 0 &&
    Number.isInteger(imageHeight) && imageHeight > 0 &&
    (x < 0 || y < 0 || width <= 0 || height <= 0 || x + width > imageWidth || y + height > imageHeight)
  ) {
    issues.push(issue(path, "label_out_of_bounds", "Label rectangle must lie within the source image"));
  }
};

export function validateMappingGeometry(document: DiagramMappingDocument): MappingIssue[] {
  const issues: MappingIssue[] = [];
  const rawDocument: unknown = document;
  if (!isRecord(rawDocument)) {
    return [issue("document", "invalid_document", "Mapping document must be an object")];
  }

  const imageWidth = rawDocument.imageWidth;
  const imageHeight = rawDocument.imageHeight;
  if (typeof imageWidth !== "number" || !Number.isInteger(imageWidth) || imageWidth <= 0) {
    issues.push(issue("imageWidth", "invalid_dimension", "Image width must be a positive integer"));
  }
  if (typeof imageHeight !== "number" || !Number.isInteger(imageHeight) || imageHeight <= 0) {
    issues.push(issue("imageHeight", "invalid_dimension", "Image height must be a positive integer"));
  }
  if (!Array.isArray(rawDocument.occurrences)) {
    issues.push(issue("occurrences", "invalid_document", "Occurrences must be an array"));
    return issues;
  }

  const limitsExceeded = pushLimitIssues(rawDocument, issues);
  const occurrenceIds = new Set<string>();
  const regionIds = new Set<string>();

  rawDocument.occurrences.forEach((rawOccurrence, occurrenceIndex) => {
    const occurrencePath = `occurrences[${occurrenceIndex}]`;
    if (!isRecord(rawOccurrence)) {
      issues.push(issue(occurrencePath, "invalid_occurrence", "Occurrence must be an object"));
      return;
    }

    if (typeof rawOccurrence.calloutId !== "string") {
      issues.push(issue(`${occurrencePath}.calloutId`, "invalid_occurrence_id", "Callout ID must be a string"));
    } else if (occurrenceIds.has(rawOccurrence.calloutId)) {
      issues.push(issue(`${occurrencePath}.calloutId`, "duplicate_occurrence_id", "Callout ID must be unique within the document"));
    } else {
      occurrenceIds.add(rawOccurrence.calloutId);
    }

    validateLabel(rawOccurrence.labelRegion, `${occurrencePath}.labelRegion`, imageWidth as number, imageHeight as number, issues);
    if (!Array.isArray(rawOccurrence.regions)) {
      issues.push(issue(`${occurrencePath}.regions`, "invalid_regions", "Regions must be an array"));
      return;
    }

    rawOccurrence.regions.forEach((rawRegion, regionIndex) => {
      const currentRegionPath = `${occurrencePath}.regions[${regionIndex}]`;
      if (!isRecord(rawRegion)) {
        issues.push(issue(currentRegionPath, "invalid_region", "Region must be an object"));
        return;
      }
      if (typeof rawRegion.id !== "string") {
        issues.push(issue(`${currentRegionPath}.id`, "invalid_region_id", "Region ID must be a string"));
      } else if (regionIds.has(rawRegion.id)) {
        issues.push(issue(`${currentRegionPath}.id`, "duplicate_region_id", "Region ID must be unique within the document"));
      } else {
        regionIds.add(rawRegion.id);
      }

      const outer = validateRing(
        rawRegion.outer,
        `${currentRegionPath}.outer`,
        imageWidth as number,
        imageHeight as number,
        limitsExceeded,
        issues,
      );
      if (!Array.isArray(rawRegion.holes)) {
        issues.push(issue(`${currentRegionPath}.holes`, "invalid_holes", "Holes must be an array"));
        return;
      }
      const holes = rawRegion.holes.map((hole, holeIndex) => validateRing(
        hole,
        `${currentRegionPath}.holes[${holeIndex}]`,
        imageWidth as number,
        imageHeight as number,
        limitsExceeded,
        issues,
      ));

      if (limitsExceeded || !outer.topologyValid) return;
      holes.forEach((hole) => {
        if (!hole.topologyValid) return;
        const outside = hole.points.some((point) =>
          pointOnRing(point, outer.points) || !pointInRing(point, outer.points));
        if (outside) {
          issues.push(issue(`${currentRegionPath}.holes`, "hole_outside_outer", "Every hole must lie strictly within the outer ring"));
        }
        if (ringsIntersect(outer.points, hole.points)) {
          issues.push(issue(`${currentRegionPath}.holes`, "hole_intersection", "A hole must not touch or cross the outer ring"));
        }
      });

      for (let leftIndex = 0; leftIndex < holes.length; leftIndex += 1) {
        const left = holes[leftIndex];
        if (!left.topologyValid) continue;
        for (let rightIndex = leftIndex + 1; rightIndex < holes.length; rightIndex += 1) {
          const right = holes[rightIndex];
          if (!right.topologyValid) continue;
          if (ringsIntersect(left.points, right.points)) {
            issues.push(issue(`${currentRegionPath}.holes`, "hole_intersection", "Holes must not touch or cross"));
          } else if (
            pointInRing(left.points[0], right.points) ||
            pointInRing(right.points[0], left.points)
          ) {
            issues.push(issue(`${currentRegionPath}.holes`, "nested_hole", "Holes must not contain one another"));
          }
        }
      }
    });
  });

  return issues;
}

export function percentagePoint(
  [x, y]: ImagePoint,
  width: number,
  height: number,
): ImagePoint {
  return [x * width / 100, y * height / 100];
}

const ringPath = (ring: ImagePoint[]) =>
  ring.map(([x, y], index) => `${index === 0 ? "M" : "L"} ${x} ${y}`).join(" ") + " Z";

export const regionPath = (region: ComponentRegion) =>
  [region.outer, ...region.holes].map(ringPath).join(" ");

export function pointInRegion(point: ImagePoint, region: ComponentRegion): boolean {
  if (!pointOnRing(point, region.outer) && !pointInRing(point, region.outer)) return false;
  return !region.holes.some((hole) => pointOnRing(point, hole) || pointInRing(point, hole));
}
