"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRequest } from "@/state/RequestContext";
import { formatAmount } from "@/lib/format";
import { Icon } from "./Icon";
import { QuantityStepper } from "./QuantityStepper";
import styles from "./CheckCart.module.css";

export interface CheckCartProps {
  /** The toolbar's own button styling, so this matches its neighbours. */
  buttonClassName: string;
  iconClassName: string;
  disabled?: boolean;
  /** Where the cart opens — "above" when the button sits at the foot of a screen. */
  placement?: "below" | "above";
}

/**
 * The Check Cart toolbar button and the cart that drops from it — 12 Oct deck,
 * p64. Each line can be stepped or removed in place; Your Cart opens the full
 * list and Checkout carries on to the order.
 */
export function CheckCart({ buttonClassName, iconClassName, disabled = false, placement = "below" }: CheckCartProps) {
  const { lines, currency, updateQty, removeLine, clear } = useRequest();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const pieces = lines.reduce((sum, line) => sum + line.qty, 0);
  const priced = lines.length > 0 && lines.every((line) => line.lineTotal !== undefined);
  const subtotal = Math.round(lines.reduce((sum, line) => sum + (line.lineTotal ?? 0), 0) * 100) / 100;

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        type="button"
        className={buttonClassName}
        onClick={() => setOpen((value) => !value)}
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <Image src="/toolbar/check-cart.png" alt="" width={40} height={40} className={iconClassName} />
        Check cart · {lines.length}
      </button>

      {open ? (
        <div className={styles.menu} data-placement={placement} role="dialog" aria-label="Cart">
          {lines.length === 0 ? (
            <p className={styles.empty}>Your cart is empty.</p>
          ) : (
            <ul className={styles.lines}>
              {lines.map((line) => (
                <li key={line.partId} className={styles.line}>
                  <p className={styles.name}>
                    {line.descriptionSnapshot}
                    <span className={styles.number}> ({line.partNumberSnapshot})</span>
                  </p>
                  {line.unitPriceSnapshot !== undefined ? (
                    <p className={styles.price}>
                      {currency} {formatAmount(line.unitPriceSnapshot, currency)} × {line.qty}
                    </p>
                  ) : null}
                  <div className={styles.controls}>
                    <QuantityStepper
                      value={line.qty}
                      min={1}
                      onChange={(next) => updateQty(line.partId, next)}
                      label={`Quantity for ${line.partNumberSnapshot}`}
                    />
                    <button
                      type="button"
                      className={styles.remove}
                      onClick={() => removeLine(line.partId)}
                      aria-label={`Remove ${line.partNumberSnapshot} from the cart`}
                      title="Remove from the cart"
                    >
                      <Icon name="trash" size="sm" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <p className={styles.count}>
            {lines.length} {lines.length === 1 ? "item" : "items"} / {pieces} qty. in your cart
            {lines.length > 0 ? (
              <>
                {" "}
                <button type="button" className={styles.clear} onClick={clear}>
                  Clear cart
                </button>
              </>
            ) : null}
          </p>

          {priced ? (
            <p className={styles.subtotal}>
              <span>Subtotal</span>
              <span>{currency} {formatAmount(subtotal, currency)}</span>
            </p>
          ) : null}

          <div className={styles.links}>
            <Link
              href="/checkout"
              className={styles.checkout}
              aria-disabled={lines.length === 0 || undefined}
              onClick={(event) => { if (lines.length === 0) event.preventDefault(); else setOpen(false); }}
            >
              Checkout
            </Link>
            <Link href="/request" className={styles.cart} onClick={() => setOpen(false)}>
              Your cart
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
