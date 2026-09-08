import type { ReactElement } from "react";
import { describe, expect, test, vi } from "vitest";
import { CalloutMarker } from "@/components/CalloutMarker";

interface MarkerButtonProps {
  onPointerDown?: (event: {
    stopPropagation: () => void;
    preventDefault: () => void;
  }) => void;
  onClick?: () => void;
}

describe("zoomed drawing marker event boundary", () => {
  test("keeps marker pointerdown out of sheet panning while preserving click activation", () => {
    const onActivate = vi.fn();
    const marker = CalloutMarker({
      number: 1,
      x: 20,
      y: 30,
      onActivate,
    }) as ReactElement<MarkerButtonProps>;
    const stopPropagation = vi.fn();
    const preventDefault = vi.fn();

    expect(marker.props.onPointerDown).toBeTypeOf("function");
    marker.props.onPointerDown?.({ stopPropagation, preventDefault });

    expect(stopPropagation).toHaveBeenCalledOnce();
    expect(preventDefault).not.toHaveBeenCalled();
    marker.props.onClick?.();
    expect(onActivate).toHaveBeenCalledOnce();
  });
});
