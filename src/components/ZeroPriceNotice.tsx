import { isZeroPrice } from "@/lib/format";
export function ZeroPriceNotice({ prices }: { prices: (number | string | undefined)[] }) {
  if (!prices.some(price => price !== undefined)) return null;
  return <p role="note">
    Prices are subject to change. RUF Diamond confirms current manufacturer pricing when you request a quote.
    {prices.some(isZeroPrice) ? " A displayed 0.00 is not a selling price; it may be awaiting manufacturer information. Please request a quote for pricing." : null}
  </p>;
}
