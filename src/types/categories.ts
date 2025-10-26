export interface Category {
  id: string;
  household_id: string;
  parent_id: string | null; // null for parent categories
  name: string;
  color: string; // Hex color
  icon: string; // Lucide icon name
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CategoryInsert {
  household_id?: string; // Auto-populated from database default or user session
  parent_id?: string | null;
  name: string;
  color?: string;
  icon?: string;
  sort_order?: number;
}

export interface CategoryUpdate {
  name?: string;
  color?: string;
  icon?: string;
  sort_order?: number;
  is_active?: boolean;
}

export interface CategoryWithChildren extends Category {
  children: Category[];
}

// Color presets for picker
export const CATEGORY_COLORS = [
  { value: "#EF4444", label: "Red" },
  { value: "#F59E0B", label: "Amber" },
  { value: "#10B981", label: "Green" },
  { value: "#3B82F6", label: "Blue" },
  { value: "#8B5CF6", label: "Purple" },
  { value: "#EC4899", label: "Pink" },
  { value: "#14B8A6", label: "Teal" },
  { value: "#6B7280", label: "Gray" },
] as const;

// Common icons for categories
export const CATEGORY_ICONS = [
  "folder",
  "shopping-cart",
  "utensils",
  "car",
  "home",
  "zap",
  "tv",
  "heart",
  "briefcase",
  "gift",
  "coffee",
  "smartphone",
] as const;
