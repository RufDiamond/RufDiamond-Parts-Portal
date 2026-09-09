import {
  SourceReviewDetailSchema,
  type SourceReviewDetail,
} from "@rufdiamond/contracts";
import { readApiContract } from "@/data/api-response.server";
import { getBackendApiRead } from "@/lib/backend-api.server";
import { SourceReviewEntry } from "@/features/catalog-review/SourceReviewEntry";
export default async function ImportReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  let initial: SourceReviewDetail | null = null;
  try {
    const { id } = await params;
    initial = await readApiContract(
      await getBackendApiRead(),
      `admin/catalog-review/imports/${id}`,
      SourceReviewDetailSchema,
    );
  } catch {
    /* Fail closed without rendering private source rows. */
  }
  return initial ? (
    <SourceReviewEntry initial={initial} />
  ) : (
    <main>
      <h1>Source review unavailable</h1>
      <p>Current import and draft scope are required.</p>
    </main>
  );
}
