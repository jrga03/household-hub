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
const defaultGroupId = (householdId: string, groupKey: string) =>
  uuidV5(householdId, `default-group:${groupKey}`);

export const defaultCategoryId = (householdId: string, categoryName: string) =>
  uuidV5(householdId, `default-category:${keyOf(categoryName)}`);

export interface DefaultGroup {
  id: string;
  name: string;
  categories: { id: string; name: string }[];
}

/** `DEFAULT_GROUPS` with the household's IDs filled in. */
export const deriveDefaultGroups = (householdId: string): Promise<DefaultGroup[]> =>
  Promise.all(
    DEFAULT_GROUPS.map(async (group) => ({
      id: await defaultGroupId(householdId, group.key),
      name: group.name,
      categories: await Promise.all(
        group.categories.map(async (name) => ({
          id: await defaultCategoryId(householdId, name),
          name,
        }))
      ),
    }))
  );
