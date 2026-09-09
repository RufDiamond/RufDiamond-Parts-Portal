// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { SourceReviewDetail } from "@rufdiamond/contracts";
import { SourceReview } from "@/features/catalog-review/SourceReview";
import { MappingApiError } from "@/features/diagram-mapping/api-client";
const id = "11111111-1111-4111-8111-111111111111",
  sha = "a".repeat(64);
const initial: SourceReviewDetail = {
  id,
  version: 2,
  target: "import",
  sourceBindingSha256: sha,
  sourceConflict: false,
  canReview: true,
  rows: [
    {
      stagingRowId: id,
      stagingRowVersion: 1,
      sourceRowKey: sha,
      identityKey: sha,
      contentHash: sha,
      sourceChecksum: sha,
      jobId: id,
      lineageKey: "synthetic",
      rowNumber: 222,
      partNumber: "ASSEMBLY-1",
      description: "Synthetic assembly",
      reference: "-",
      rawQuantity: "0",
      remarks: "Includes parts 1–18",
      figurePartId: null,
      figurePartVersion: null,
    },
  ],
  issues: [
    {
      id,
      version: 1,
      stagingRowId: id,
      code: "INVALID_FIELD",
      field: "QTY",
      message: "Raw quantity0 needs review.",
    },
  ],
  approvals: [],
};
afterEach(cleanup);
describe("source review confirmation and retries", () => {
  it("requires explicit combined source confirmation and retries the exact uncertain decision", async () => {
    const approve = vi
      .fn()
      .mockRejectedValueOnce(new MappingApiError(503, "Unavailable"))
      .mockResolvedValue({ ...initial, version: 3, approvals: [] });
    const read = vi.fn().mockResolvedValue(initial);
    render(<SourceReview initial={initial} api={{ approve, read }} />);
    fireEvent.click(
      screen.getByRole("checkbox", { name: /Select ASSEMBLY-1/ }),
    );
    fireEvent.change(screen.getByLabelText("Source evidence"), {
      target: {
        value:
          "Synthetic page23 confirms informational assembly, not depicted, installed quantity unspecified.",
      },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Review source decision" }),
    );
    expect(approve).not.toHaveBeenCalled();
    expect(
      screen.getByText(
        /unspecified installed quantity and informational nondepiction/,
      ),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Confirm source decision" }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Retry exact decision" }),
      ).toBeTruthy(),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Retry exact decision" }),
    );
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain("recorded"),
    );
    expect(approve.mock.calls[1]).toEqual(approve.mock.calls[0]);
    expect(approve.mock.calls[0][2]).toMatchObject({
      decision: "assembly-reference-unspecified",
      confirmed: true,
      sourceBindingSha256: sha,
    });
    expect(approve.mock.calls[0][2]).not.toHaveProperty("reviewerId");
  });
  it("retains raw conflicts and hides confirmation without named review authority", () => {
    render(
      <SourceReview
        initial={{ ...initial, canReview: false, sourceConflict: true }}
        api={{ approve: vi.fn(), read: vi.fn() }}
      />,
    );
    expect(screen.getByText(/Raw quantity0 needs review/)).toBeTruthy();
    expect(screen.getByText(/source changed/i)).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Review source decision" }),
    ).toBeNull();
  });
  it("explicitly re-confirms both assembly semantics and reloads after a stale rejection", async () => {
    const current: SourceReviewDetail = {
      ...initial,
      target: "figure",
      sourceConflict: true,
      rows: initial.rows.map((r) => ({
        ...r,
        figurePartId: id,
        figurePartVersion: 2,
      })),
      issues: [],
      approvals: [
        {
          decisionId: id,
          quantityDecisionId: id,
          mode: "assembly-reference-unspecified",
          rowIds: [id],
          reviewerId: id,
          reviewerName: "Synthetic publisher",
          reviewedAt: "2026-09-09T00:00:00.000Z",
          evidence: "Synthetic original source",
          current: false,
        },
      ],
    };
    const approve = vi
        .fn()
        .mockRejectedValue(new MappingApiError(412, "Stale")),
      read = vi.fn().mockResolvedValue({ ...current, version: 3 });
    render(<SourceReview initial={current} api={{ approve, read }} />);
    fireEvent.click(
      screen.getByRole("checkbox", { name: /Select ASSEMBLY-1/ }),
    );
    fireEvent.change(screen.getByLabelText(/Depiction decision/), {
      target: { value: "assembly-reference-unspecified" },
    });
    fireEvent.change(screen.getByLabelText("Source evidence"), {
      target: {
        value: "Synthetic first drawing and assembly source reviewed.",
      },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Review source decision" }),
    );
    expect(
      screen.getByText(
        /Confirm BOTH unspecified installed quantity and informational nondepiction/,
      ),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Confirm source decision" }),
    );
    await waitFor(() =>
      expect(screen.getByText(/Decision rejected or source/)).toBeTruthy(),
    );
    expect(approve.mock.calls[0][2]).toMatchObject({
      mode: "assembly-reference-unspecified",
      quantityDecisionId: id,
    });
    expect(
      screen.queryByRole("button", { name: "Retry exact decision" }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Reload source" }));
    await waitFor(() => expect(read).toHaveBeenCalledOnce());
  });
});
