import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import { FigureWorkspace, type FigureWorkspaceProps } from "@/app/(portal)/figures/[figureId]/FigureWorkspace";
import { getFigureDetail } from "@/data/repository";
import { MachineProvider } from "@/state/MachineContext";
import { RequestProvider } from "@/state/RequestContext";

// Navigation is the framework boundary; the workspace and state providers are real.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

async function renderWorkspace(reviewOnly: boolean) {
  const props: FigureWorkspaceProps & { reviewOnly: boolean } = {
    detail: (await getFigureDetail("fig-cabin-6-2"))!,
    reviewOnly,
    previewNotice: reviewOnly ? "Marker review — unapproved; not for ordering." : null,
    usage: {}, sheet: "02 / 18", index: 1, total: 18,
    previousId: "fig-cabin-6-1", nextId: "fig-cabin-6-3",
    firstId: "fig-cabin-6-1", lastId: "fig-cabin-6-18",
  };
  return renderToStaticMarkup(
    <MachineProvider><RequestProvider><FigureWorkspace {...props} /></RequestProvider></MachineProvider>,
  );
}

test("hosted review cannot start a quote, add parts, or export an unlabelled list", async () => {
  const html = await renderWorkspace(true);
  const buttons = [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)];
  for (const label of ["Request a quote", "Add to cart", "Email", "Print", "Check cart"]) {
    const button = buttons.find((match) => match[2].includes(label));
    expect(button, label).toBeDefined();
    expect(button![1], label).toContain("disabled");
  }
  expect(html).not.toMatch(/aria-label="Add [^"]+ to the cart"/);
  expect(html).toContain('href="/figures/fig-cabin-6-2"');
});

test("ordinary figure provides an explicit review entry without disabling its quote flow", async () => {
  const html = await renderWorkspace(false);
  expect(html).toContain('href="/review/figures/fig-cabin-6-2"');
  const quote = [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)]
    .find((match) => match[2].includes("Request a quote"));
  expect(quote![1]).not.toContain("disabled");
});
