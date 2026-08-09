import { parts } from "@/data/parts";
import styles from "./page.module.css";

const cad = new Intl.NumberFormat("en-CA", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export default function PartsPage() {
  const total = parts.reduce((sum, part) => sum + part.costCad, 0);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Parts</h1>
          <p className={styles.subtitle}>
            {parts.length} lines &middot; costs in Canadian dollars
          </p>
        </div>
        <span className="label">RufDiamond</span>
      </header>

      <table className={styles.table}>
        <caption className="label">Requisition — filtration &amp; fluids</caption>
        <thead>
          <tr>
            <th scope="col">Ref</th>
            <th scope="col">Part no.</th>
            <th scope="col">Description</th>
            <th scope="col" className={styles.numHead}>
              Qty
            </th>
            <th scope="col" className={styles.numHead}>
              Cost CAD
            </th>
          </tr>
        </thead>
        <tbody>
          {parts.map((part) => (
            <tr key={part.partNo}>
              <td className={styles.ref}>{part.ref}</td>
              <th scope="row" className={styles.partNo}>
                {part.partNo}
              </th>
              <td className={styles.description}>{part.description}</td>
              <td className={`${styles.num} ${styles.qty}`}>{part.qty}</td>
              <td className={styles.num}>{cad.format(part.costCad)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={3} />
            <td className={styles.totalLabel}>Total</td>
            <td className={styles.num}>{cad.format(total)}</td>
          </tr>
        </tfoot>
      </table>

      <p className={styles.footnote}>
        Total is the sum of the Cost CAD column as listed; quantities are not
        applied.
      </p>
    </main>
  );
}
