import { asCents, type Cents } from "@/lib/currency";

/** Fixture shorthand: `amount_cents: cents(12345)`. */
export const cents = (n: number): Cents => asCents(n);
