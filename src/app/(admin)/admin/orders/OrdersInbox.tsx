"use client";

import { buildOrdersCsv, downloadCsv } from "@/lib/adminCsv";
import { formatAmount } from "@/lib/format";
import type { AdminOrder, OrderState } from "@/types/admin";
import { AdminShell } from "../AdminShell";
import shell from "../admin.module.css";
import catalog from "../catalog.module.css";

const OPERATOR = "C. Kane";

const STATE_LABEL: Record<OrderState, string> = {
  new: "New",
  quoted: "Quoted",
  shipped: "Shipped",
  "requires-dealer-approval": "Requires dealer approval",
};

/** Fill, rule and hatch carry the state — never colour. */
const STATE_CLASS: Record<OrderState, string> = {
  shipped: catalog.chipLive,
  new: catalog.chipDraft,
  quoted: catalog.chipNotRegistered,
  "requires-dealer-approval": catalog.chipAwaiting,
};

export function OrdersInbox({ orders }: { orders: AdminOrder[] }) {
  const count = (state: OrderState) =>
    orders.filter((order) => order.state === state).length;

  const total = orders.reduce((sum, order) => sum + order.valueCad, 0);

  return (
    <AdminShell
      active="orders"
      title="Orders"
      operator={OPERATOR}
      record={[
        { label: "New", value: String(count("new")) },
        { label: "Quoted", value: String(count("quoted")) },
        {
          label: "Held",
          value: String(count("requires-dealer-approval")),
        },
        { label: "Orders", value: String(orders.length) },
        { label: "Value", value: `CAD ${formatAmount(total, "CAD")}` },
      ]}
      actions={
        <button
          type="button"
          className={shell.button}
          onClick={() =>
            downloadCsv(
              "rufdiamond-orders",
              buildOrdersCsv(orders, (state) => STATE_LABEL[state]),
            )
          }
        >
          Export to accounting
        </button>
      }
    >
      <table className={catalog.table}>
        <thead>
          <tr>
            <th scope="col" style={{ width: 130 }}>
              Order
            </th>
            <th scope="col">Customer</th>
            <th scope="col" style={{ width: 100 }}>
              Line
            </th>
            <th scope="col" style={{ width: 250 }}>
              Machine · serial range
            </th>
            <th scope="col" className={catalog.colNum} style={{ width: 60 }}>
              Lines
            </th>
            <th scope="col" className={catalog.colNum} style={{ width: 112 }}>
              Value CAD
            </th>
            <th scope="col" style={{ width: 150 }}>
              Discount tier
            </th>
            <th scope="col" style={{ width: 150 }}>
              Status
            </th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order.id}>
              <td className={catalog.mono} style={{ fontSize: 13 }}>
                {order.reference}
              </td>
              <td>{order.customer}</td>
              <td className={catalog.small}>{order.productLine}</td>
              <td>
                {order.model}
                <span className={catalog.subline}>{order.serialRange}</span>
              </td>
              <td className={catalog.num}>{order.lines}</td>
              <td className={catalog.num}>
                {formatAmount(order.valueCad, "CAD")}
              </td>
              <td className={catalog.small}>{order.discountTier}</td>
              <td>
                <span
                  className={`${catalog.chip} ${STATE_CLASS[order.state]}`}
                >
                  {STATE_LABEL[order.state]}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className={catalog.note} style={{ marginTop: 18, maxWidth: "80ch" }}>
        <span className={catalog.noteMark}>i</span>
        <span>
          Every order carries the machine and serial range it was raised
          against. Check fitment against that range before quoting — FT3 Wagon
          parts do not carry back to earlier serials.
        </span>
      </div>
    </AdminShell>
  );
}
