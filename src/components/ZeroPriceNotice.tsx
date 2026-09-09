import { isZeroPrice } from "@/lib/format";
export function ZeroPriceNotice({ prices }: { prices: (number | string | undefined)[] }) {
  return prices.some(isZeroPrice) ? <p role="note">A displayed 0.00 price may be awaiting manufacturer information. Please request a quote for pricing.</p> : null;
}
