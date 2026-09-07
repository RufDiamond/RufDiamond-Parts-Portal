import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import {
  FullIllustration,
  type FullIllustrationProps,
} from "@/components/FullIllustration";

function renderFullIllustration(previewNotice?: string | null): string {
  const props: FullIllustrationProps = {
    label: "Sheet 02 / 18",
    src: "/drawings/fixture.png",
    width: 1280,
    height: 720,
    markers: [],
    trail: "Model image > Fixture",
    date: "September 7, 2026",
    onClose: vi.fn(),
    previewNotice,
  };

  return renderToStaticMarkup(createElement(FullIllustration, props));
}

describe("FullIllustration preview notice", () => {
  test("keeps preview status and existing enlargement guidance visible outside the artwork", () => {
    const html = renderFullIllustration(
      "Local preview — unapproved marker positions; not for ordering.",
    );

    expect(html).toContain('role="status"');
    expect(html).toContain("Local preview");
    expect(html).toContain("not for ordering");
    expect(html).toContain("Zoom in");
    expect(html.indexOf('role="status"')).toBeLessThan(html.indexOf("<figure"));
  });

  test("omits preview status and guidance when preview is off", () => {
    const html = renderFullIllustration(null);

    expect(html).not.toContain('role="status"');
    expect(html).not.toContain("Local preview");
    expect(html).not.toContain("crowded labels");
  });
});
