import type { Cents } from "@/lib/currency";
import type { Database } from "@/types/database.types";

// Every BIGINT money column is branded where rows enter the typed client.
type CentsColumn = `${string}_cents`;
type BrandValue<V> = V extends number ? Cents : V;
type BrandRow<R> = { [K in keyof R]: K extends CentsColumn ? BrandValue<R[K]> : R[K] };
type BrandTable<T extends { Row: unknown; Insert: unknown; Update: unknown }> = Omit<
  T,
  "Row" | "Insert" | "Update"
> & { Row: BrandRow<T["Row"]>; Insert: BrandRow<T["Insert"]>; Update: BrandRow<T["Update"]> };
type BrandReturns<R> = R extends readonly (infer E)[] ? BrandRow<E>[] : R;
type BrandFunction<F extends { Returns: unknown }> = Omit<F, "Returns"> & {
  Returns: BrandReturns<F["Returns"]>;
};

type Schema = {
  Tables: Record<string, { Row: unknown; Insert: unknown; Update: unknown }>;
  Functions: Record<string, { Returns: unknown }>;
};

export type BrandSchema<S extends Schema> = Omit<S, "Tables" | "Functions"> & {
  Tables: { [T in keyof S["Tables"]]: BrandTable<S["Tables"][T]> };
  Functions: { [F in keyof S["Functions"]]: BrandFunction<S["Functions"][F]> };
};

export type AppDatabase = Omit<Database, "public"> & {
  public: BrandSchema<Database["public"]>;
};
