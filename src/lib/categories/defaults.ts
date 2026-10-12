import { uuidV5 } from "@/lib/utils/uuid";

/** The suggested Household categories. Personal categories have none. */
export const DEFAULT_GROUPS = [
  {
    key: "savings",
    name: "Savings",
    categories: ["Forever House", "Retirement", "Big Ticket Items"],
  },
  { key: "bills", name: "Bills", categories: ["Utilities", "Subscriptions"] },
  { key: "food", name: "Food", categories: ["Groceries", "Restaurants", "Delivery"] },
  { key: "getting-around", name: "Getting Around", categories: ["Transportation"] },
  { key: "personal", name: "Personal", categories: ["Allowances"] },
] as const;

const keyOf = (name: string) => name.toLowerCase().replace(/\s+/g, "-");

/** Derived from the household and a fixed key, so two members seeding offline make the same records. */
export const defaultGroupId = (householdId: string, groupKey: string) =>
  uuidV5(householdId, `default-group:${groupKey}`);

export const defaultCategoryId = (householdId: string, categoryName: string) =>
  uuidV5(householdId, `default-category:${keyOf(categoryName)}`);
