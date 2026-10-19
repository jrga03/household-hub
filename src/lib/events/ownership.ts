const VISIBILITIES = ["household", "personal"] as const;
export type Visibility = (typeof VISIBILITIES)[number];

export const VISIBILITY_LABELS: Record<Visibility, string> = {
  household: "Household",
  personal: "Personal",
};

/** Who sees a record: its visibility, and its owner when Personal. */
export interface Ownership {
  visibility: Visibility;
  ownerUserId: string | null;
}

export const sameOwnership = (a: Ownership, b: Ownership) =>
  a.visibility === b.visibility && a.ownerUserId === b.ownerUserId;

export const isVisibility = (value: string): value is Visibility =>
  VISIBILITIES.some((visibility) => visibility === value);
