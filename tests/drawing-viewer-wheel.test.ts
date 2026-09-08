import { describe, expect, test, vi } from "vitest";
import * as drawingViewer from "@/components/DrawingViewer";

interface WheelInput {
  deltaX: number;
  deltaY: number;
  ctrlKey: boolean;
  metaKey: boolean;
  target: object | null;
  preventDefault: () => void;
}

type HandleDrawingWheel = (
  event: WheelInput,
  drawing: { contains: (target: object) => boolean } | null,
  zoom: number,
  onZoomChange?: (zoom: number) => void,
) => boolean;

const handleDrawingWheel = (
  drawingViewer as unknown as {
    handleDrawingWheel?: HandleDrawingWheel;
  }
).handleDrawingWheel;

function wheel(
  options: Partial<WheelInput> = {},
): WheelInput {
  return {
    deltaX: 0,
    deltaY: -100,
    ctrlKey: false,
    metaKey: false,
    target: {},
    preventDefault: vi.fn(),
    ...options,
  };
}

describe("drawing wheel zoom", () => {
  test.each([
    ["plain wheel up over image", false, false, -100, 1, 1.5],
    ["plain wheel down over marker", false, false, 100, 2, 1.5],
    ["Ctrl/pinch up", true, false, -1, 1.5, 2],
    ["Command/pinch down", false, true, 1, 3, 2],
  ])(
    "zooms one existing step for %s",
    (_name, ctrlKey, metaKey, deltaY, zoom, expected) => {
      const event = wheel({ ctrlKey, metaKey, deltaY });
      const onZoomChange = vi.fn();
      const drawing = { contains: (target: object) => target === event.target };

      expect(
        handleDrawingWheel?.(event, drawing, zoom, onZoomChange),
      ).toBe(true);
      expect(event.preventDefault).toHaveBeenCalledOnce();
      expect(onZoomChange).toHaveBeenCalledWith(expected);
    },
  );

  test.each([
    ["upper", -100, 4],
    ["lower", 100, 1],
  ])("keeps the existing %s zoom bound", (_name, deltaY, zoom) => {
    const event = wheel({ deltaY });
    const onZoomChange = vi.fn();
    const drawing = { contains: () => true };

    expect(handleDrawingWheel?.(event, drawing, zoom, onZoomChange)).toBe(true);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(onZoomChange).toHaveBeenCalledWith(zoom);
  });

  test.each([
    ["zero delta", wheel({ deltaY: 0 })],
    ["horizontal-only", wheel({ deltaX: 100, deltaY: 0 })],
    ["blank sheet area", wheel()],
    ["outside the viewer", wheel()],
  ])("does not consume %s", (_name, event) => {
    const onZoomChange = vi.fn();
    const drawing =
      _name === "outside the viewer"
        ? null
        : { contains: () => _name !== "blank sheet area" };

    expect(
      handleDrawingWheel?.(event, drawing, 1, onZoomChange),
    ).toBe(false);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(onZoomChange).not.toHaveBeenCalled();
  });
});
