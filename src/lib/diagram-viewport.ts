export interface ViewportRect { left: number; top: number; right: number; bottom: number }

export const DIAGRAM_ZOOM_STEPS = [1, 1.5, 2, 3, 4];

export function revealDelta(target: ViewportRect, viewport: ViewportRect): { x: number; y: number } {
  const axis = (start: number, end: number, low: number, high: number) => {
    if ((start >= low && end <= high) || (start <= low && end >= high)) return 0;
    if (end - start > high - low) return start > low ? start - low : end - high;
    return start < low ? start - low : end - high;
  };
  return { x:axis(target.left, target.right, viewport.left, viewport.right), y:axis(target.top, target.bottom, viewport.top, viewport.bottom) };
}

export function revealZoom(target: ViewportRect, viewport: ViewportRect, zoom: number): number {
  const fits = (candidate: number) => (target.right - target.left) * candidate / zoom <= viewport.right - viewport.left &&
    (target.bottom - target.top) * candidate / zoom <= viewport.bottom - viewport.top;
  if (fits(zoom)) return zoom;
  return DIAGRAM_ZOOM_STEPS.filter((step) => step < zoom && fits(step)).at(-1) ?? 1;
}
