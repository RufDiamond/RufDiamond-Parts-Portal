/** Fixed-scale decimal arithmetic. Prices use 4 decimal places; money totals use 2. */

const pow10 = (scale: number) => BigInt(10) ** BigInt(scale);

export function parseDecimal(value: string, scale = 4): bigint {
  if (!/^-?\d+(\.\d+)?$/.test(value)) throw new TypeError("Invalid decimal");
  const negative = value.startsWith("-");
  const [whole, fraction = ""] = (negative ? value.slice(1) : value).split(".");
  if (fraction.length > scale) throw new TypeError("Too many decimal places");
  const scaled = BigInt(whole) * pow10(scale) + BigInt((fraction + "0".repeat(scale)).slice(0, scale));
  return negative ? -scaled : scaled;
}

export function formatDecimal(value: bigint, scale = 4): string {
  const negative = value < BigInt(0);
  const absolute = negative ? -value : value;
  const base = pow10(scale);
  const fraction = (absolute % base).toString().padStart(scale, "0");
  return `${negative ? "-" : ""}${absolute / base}.${fraction}`;
}

/** Round half away from zero, matching PostgreSQL round() for these positive amounts. */
export function roundDecimal(value: bigint, fromScale: number, toScale: number): bigint {
  if (toScale >= fromScale) return value * pow10(toScale - fromScale);
  const factor = pow10(fromScale - toScale);
  const negative = value < BigInt(0);
  const absolute = negative ? -value : value;
  const quotient = absolute / factor;
  const remainder = absolute % factor;
  const rounded = remainder * BigInt(2) >= factor ? quotient + BigInt(1) : quotient;
  return negative ? -rounded : rounded;
}

export function multiply(value: bigint, qty: number, scale = 4): bigint {
  return value * BigInt(qty);
}

/** list * (1 - rate). Rate is a 0–1 decimal string. Result stays at `scale`. */
export function applyDiscount(listPrice: bigint, discountRate: string, scale = 4): bigint {
  const rateScale = 6;
  const rate = parseDecimal(discountRate, rateScale);
  const keep = pow10(rateScale) - rate;
  const product = listPrice * keep;
  return roundDecimal(product, scale + rateScale, scale);
}

export function lineTotal(unitPrice: bigint, qty: number): string {
  return formatDecimal(roundDecimal(multiply(unitPrice, qty), 4, 2), 2);
}
