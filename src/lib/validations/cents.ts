import { z } from "zod";
import type { Cents } from "@/lib/currency";

/**
 * A form field already holding cents (CurrencyInput emits Cents). z.custom keeps
 * input and output types equal, which react-hook-form's resolver needs; chain
 * .refine() for sign and range.
 */
export const centsSchema = z.custom<Cents>(
  (value) => typeof value === "number" && Number.isSafeInteger(value),
  { message: "Amount must be a whole number of cents" }
);
