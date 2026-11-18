import Link from "next/link";
import { CommerceOrderPageSchema } from "@rufdiamond/contracts";
import { Value } from "@sinclair/typebox/value";
import { getBackendApiRead } from "@/lib/backend-api.server";
import { requireCustomerSession } from "@/lib/customer-session.server";
import { formatAmount } from "@/lib/format";
import styles from "./orders.module.css";

export default async function OrdersPage() {
  const session = await requireCustomerSession();
  if (!session) return <main className={styles.page}><Link href="/signin">Sign in to view your orders</Link></main>;
  const read = await getBackendApiRead();
  const response = await read("commerce-orders/mine");
  const data: unknown = await response.json();
  if (!response.ok || !Value.Check(CommerceOrderPageSchema, data)) {
    return <main className={styles.page}><h1>Order status</h1><p role="alert">Saved orders are temporarily unavailable.</p><Link href="/orders">Retry</Link></main>;
  }
  return <main className={styles.page}>
    <h1>Order status</h1>
    {!data.items.length && <p>You have no submitted orders yet.</p>}
    {data.items.map(order => <section className={styles.order} key={order.id} id={`order-${order.id}`}>
      <div className={styles.heading}>
        <h2>Order {order.reference}</h2>
        <span>{order.status.charAt(0).toUpperCase() + order.status.slice(1)}</span>
      </div>
      <p>PO {order.customerPo} · VIN {order.vin} · {new Date(order.submittedAt).toLocaleDateString("en-CA", { timeZone: "America/Toronto" })}</p>
      <div className={styles.tableWrap}><table>
        <thead><tr><th>Part number</th><th>Description</th><th>Quantity</th>{order.netTotal && <><th>Unit price ({order.currency})</th><th>Total ({order.currency})</th></>}</tr></thead>
        <tbody>{order.lines.map((line, index) => <tr key={index}>
          <td>{line.partNumber}</td><td>{line.description}</td><td>{line.qty}</td>
          {order.netTotal && <><td>{formatAmount(Number(line.unitPrice), order.currency === "USD" ? "USD" : "CAD")}</td><td>{line.lineTotal}</td></>}
        </tr>)}</tbody>
      </table></div>
      {order.netTotal && <p className={styles.total}>Total ({order.currency}) {order.netTotal}</p>}
    </section>)}
  </main>;
}
