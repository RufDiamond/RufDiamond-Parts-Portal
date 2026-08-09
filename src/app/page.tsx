import { getFigureDetail } from "@/data/repository";
import { EmptyState, PartsTable, TitleBlock } from "@/components";
import { formatFigureRef } from "@/lib/format";
import styles from "./page.module.css";

/**
 * The proof screen from the design-system pass, now reading through the
 * repository seam instead of a local array. Real navigation comes later.
 */
export default async function Page() {
  const detail = await getFigureDetail("fig-filters-1-1");

  if (!detail) {
    return (
      <main className={styles.page}>
        <EmptyState
          title="Figure not found"
          description="The requested figure is not in this catalogue."
        />
      </main>
    );
  }

  const { figure, system, variant, rows } = detail;

  return (
    <main className={styles.page}>
      <TitleBlock
        eyebrow={system.name}
        title={`${formatFigureRef(figure.groupNo)} — ${figure.name}`}
        subtitle="Fat Truck FT3 Wagon"
        meta={[
          { label: "Serial", value: variant.label },
          { label: "Revision", value: variant.catalogRevision },
          { label: "Lines", value: String(rows.length) },
        ]}
      />

      <div className={styles.section}>
        <PartsTable rows={rows} showTotal caption="Parts list" />
      </div>
    </main>
  );
}
