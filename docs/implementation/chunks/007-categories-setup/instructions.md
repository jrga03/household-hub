# Instructions: Categories Setup

Follow these steps in order. Estimated time: 45 minutes.

---

## Step 1: Create Category Types (5 min)

Create `src/types/categories.ts`:

```typescript
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
  household_id?: string;
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
```

---

## Step 2: Add Category Query Hooks (10 min)

Update `src/lib/supabaseQueries.ts` to add category hooks:

```typescript
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "./supabase";
import type { Category, CategoryInsert, CategoryUpdate } from "@/types/categories";

// Fetch all categories
export function useCategories() {
  return useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("*")
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });

      if (error) throw error;
      return data as Category[];
    },
    staleTime: 10 * 60 * 1000, // 10 minutes (categories change rarely)
  });
}

// Fetch categories grouped by parent
export function useCategoriesGrouped() {
  return useQuery({
    queryKey: ["categories", "grouped"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("*")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });

      if (error) throw error;

      const categories = data as Category[];

      // Group by parent_id
      const grouped = categories.reduce((acc, category) => {
        if (category.parent_id === null) {
          // Parent category
          acc.push({
            ...category,
            children: categories.filter((c) => c.parent_id === category.id),
          });
        }
        return acc;
      }, [] as CategoryWithChildren[]);

      return grouped;
    },
    staleTime: 10 * 60 * 1000,
  });
}

// Create category
export function useCreateCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (category: CategoryInsert) => {
      const { data, error } = await supabase.from("categories").insert(category).select().single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
    },
  });
}

// Update category
export function useUpdateCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: CategoryUpdate }) => {
      const { data, error } = await supabase
        .from("categories")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
    },
  });
}

// Archive category (soft delete)
export function useArchiveCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("categories").update({ is_active: false }).eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
    },
  });
}
```

---

## Step 3: Create Categories Route (5 min)

Create `src/routes/categories.tsx`:

```typescript
import { createFileRoute } from "@tanstack/react-router";
import { useCategoriesGrouped } from "@/lib/supabaseQueries";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/categories")({
  component: Categories,
});

function Categories() {
  const { data: categories, isLoading } = useCategoriesGrouped();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto" />
          <p className="mt-4 text-sm text-muted-foreground">Loading categories...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b">
        <div className="container mx-auto flex items-center justify-between px-4 py-4">
          <h1 className="text-xl font-bold">Categories</h1>
          <Button onClick={() => setIsFormOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Category
          </Button>
        </div>
      </header>

      {/* Content */}
      <main className="container mx-auto px-4 py-8">
        {categories && categories.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">No categories yet. Create your first category!</p>
            <Button onClick={() => setIsFormOpen(true)} className="mt-4">
              <Plus className="mr-2 h-4 w-4" />
              Create Category
            </Button>
          </div>
        ) : (
          <div className="space-y-6">
            {categories?.map((parent) => (
              <div key={parent.id} className="rounded-lg border p-6">
                {/* Parent category header */}
                <div
                  className="flex items-center gap-3 mb-4 pb-4 border-b"
                  style={{ borderLeftWidth: "4px", borderLeftColor: parent.color }}
                >
                  <div className="flex-1">
                    <h3 className="font-semibold text-lg">{parent.name}</h3>
                    <p className="text-sm text-muted-foreground">
                      {parent.children.length} subcategories
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setEditingId(parent.id);
                      setIsFormOpen(true);
                    }}
                  >
                    Edit
                  </Button>
                </div>

                {/* Child categories */}
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {parent.children.map((child) => (
                    <div
                      key={child.id}
                      className="flex items-center gap-3 rounded-md border p-3 hover:bg-accent cursor-pointer"
                      onClick={() => {
                        setEditingId(child.id);
                        setIsFormOpen(true);
                      }}
                      style={{ borderLeftWidth: "3px", borderLeftColor: child.color }}
                    >
                      <div className="text-muted-foreground">
                        {/* Icon placeholder - will render icon component */}
                      </div>
                      <span className="text-sm font-medium">{child.name}</span>
                    </div>
                  ))}
                </div>

                {/* Add subcategory button */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-4"
                  onClick={() => {
                    // Open form with parent_id pre-filled
                    setIsFormOpen(true);
                  }}
                >
                  <Plus className="mr-2 h-3 w-3" />
                  Add subcategory
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* Category Form Dialog - TODO: Create this component */}
        {/* <CategoryFormDialog
          open={isFormOpen}
          onClose={() => { setIsFormOpen(false); setEditingId(null); }}
          editingId={editingId}
        /> */}
      </main>
    </div>
  );
}
```

---

## Step 4: Create Color Picker Component (5 min)

Create `src/components/ui/color-picker.tsx`:

```typescript
import { CATEGORY_COLORS } from "@/types/categories";
import { cn } from "@/lib/utils";

interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
}

export function ColorPicker({ value, onChange }: ColorPickerProps) {
  return (
    <div className="flex gap-2 flex-wrap">
      {CATEGORY_COLORS.map((color) => (
        <button
          key={color.value}
          type="button"
          onClick={() => onChange(color.value)}
          className={cn(
            "w-8 h-8 rounded-full border-2 transition-all",
            value === color.value
              ? "border-primary ring-2 ring-primary ring-offset-2"
              : "border-transparent hover:scale-110"
          )}
          style={{ backgroundColor: color.value }}
          title={color.label}
          aria-label={`Select ${color.label} color`}
        />
      ))}
    </div>
  );
}
```

---

## Step 5: Create Icon Picker Component (5 min)

Create `src/components/ui/icon-picker.tsx`:

```typescript
import { CATEGORY_ICONS } from "@/types/categories";
import * as LucideIcons from "lucide-react";
import { cn } from "@/lib/utils";

interface IconPickerProps {
  value: string;
  onChange: (icon: string) => void;
}

export function IconPicker({ value, onChange }: IconPickerProps) {
  return (
    <div className="grid grid-cols-6 gap-2">
      {CATEGORY_ICONS.map((iconName) => {
        // Get icon component from lucide-react
        const IconComponent = LucideIcons[
          iconName.split("-").map((word) =>
            word.charAt(0).toUpperCase() + word.slice(1)
          ).join("") as keyof typeof LucideIcons
        ] as React.ComponentType<{ className?: string }>;

        return (
          <button
            key={iconName}
            type="button"
            onClick={() => onChange(iconName)}
            className={cn(
              "p-3 rounded-md border-2 transition-all hover:bg-accent",
              value === iconName
                ? "border-primary bg-accent"
                : "border-transparent"
            )}
            title={iconName}
            aria-label={`Select ${iconName} icon`}
          >
            {IconComponent && <IconComponent className="h-5 w-5" />}
          </button>
        );
      })}
    </div>
  );
}
```

---

## Step 6: Create Category Form (10 min)

Install required components:

```bash
npx shadcn-ui@latest add dialog select
```

Create `src/components/CategoryFormDialog.tsx`:

```typescript
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ColorPicker } from "@/components/ui/color-picker";
import { IconPicker } from "@/components/ui/icon-picker";
import {
  useCategories,
  useCreateCategory,
  useUpdateCategory,
} from "@/lib/supabaseQueries";

const categorySchema = z.object({
  name: z.string().min(1, "Name is required").max(50, "Name too long"),
  parent_id: z.string().nullable(),
  color: z.string().regex(/^#[0-9A-F]{6}$/i, "Invalid color"),
  icon: z.string().min(1, "Icon is required"),
  sort_order: z.number().min(0).default(0),
});

type CategoryFormData = z.infer<typeof categorySchema>;

interface Props {
  open: boolean;
  onClose: () => void;
  editingId?: string | null;
  defaultParentId?: string | null;
}

export function CategoryFormDialog({
  open,
  onClose,
  editingId,
  defaultParentId,
}: Props) {
  const { data: categories } = useCategories();
  const createCategory = useCreateCategory();
  const updateCategory = useUpdateCategory();

  const form = useForm<CategoryFormData>({
    resolver: zodResolver(categorySchema),
    defaultValues: {
      name: "",
      parent_id: defaultParentId || null,
      color: "#6B7280",
      icon: "folder",
      sort_order: 0,
    },
  });

  // Load existing category data when editing
  useEffect(() => {
    if (editingId && categories) {
      const category = categories.find((c) => c.id === editingId);
      if (category) {
        form.reset({
          name: category.name,
          parent_id: category.parent_id,
          color: category.color,
          icon: category.icon,
          sort_order: category.sort_order,
        });
      }
    }
  }, [editingId, categories, form]);

  const onSubmit = async (data: CategoryFormData) => {
    try {
      if (editingId) {
        await updateCategory.mutateAsync({
          id: editingId,
          updates: data,
        });
      } else {
        await createCategory.mutateAsync(data);
      }

      form.reset();
      onClose();
    } catch (error) {
      console.error("Failed to save category:", error);
    }
  };

  // Get parent categories only
  const parentCategories = categories?.filter((c) => c.parent_id === null) || [];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {editingId ? "Edit Category" : "Create Category"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          {/* Name */}
          <div>
            <Label htmlFor="name">Category Name</Label>
            <Input
              id="name"
              {...form.register("name")}
              placeholder="e.g., Groceries"
            />
            {form.formState.errors.name && (
              <p className="text-sm text-destructive mt-1">
                {form.formState.errors.name.message}
              </p>
            )}
          </div>

          {/* Parent Category */}
          <div>
            <Label htmlFor="parent_id">Parent Category (optional)</Label>
            <Select
              value={form.watch("parent_id") || "none"}
              onValueChange={(value) =>
                form.setValue("parent_id", value === "none" ? null : value)
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None (Parent Category)</SelectItem>
                {parentCategories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">
              Leave empty to create a parent category
            </p>
          </div>

          {/* Color */}
          <div>
            <Label>Color</Label>
            <ColorPicker
              value={form.watch("color")}
              onChange={(color) => form.setValue("color", color)}
            />
          </div>

          {/* Icon */}
          <div>
            <Label>Icon</Label>
            <IconPicker
              value={form.watch("icon")}
              onChange={(icon) => form.setValue("icon", icon)}
            />
          </div>

          {/* Sort Order */}
          <div>
            <Label htmlFor="sort_order">Sort Order</Label>
            <Input
              id="sort_order"
              type="number"
              {...form.register("sort_order", { valueAsNumber: true })}
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 mt-6">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting
                ? "Saving..."
                : editingId
                ? "Update"
                : "Create"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

---

## Step 7: Seed Initial Categories (5 min)

Create a seed script `scripts/seed-categories.sql`:

```sql
-- Seed initial categories
-- Run this in Supabase SQL editor

-- Parent: Food
INSERT INTO categories (name, parent_id, color, icon, sort_order) VALUES
('Food', NULL, '#EF4444', 'utensils', 1);

-- Get the Food parent id
WITH food_parent AS (
  SELECT id FROM categories WHERE name = 'Food' AND parent_id IS NULL
)
INSERT INTO categories (name, parent_id, color, icon, sort_order)
SELECT 'Groceries', id, '#EF4444', 'shopping-cart', 1 FROM food_parent
UNION ALL
SELECT 'Dining Out', id, '#EF4444', 'coffee', 2 FROM food_parent
UNION ALL
SELECT 'Snacks', id, '#EF4444', 'gift', 3 FROM food_parent;

-- Parent: Transportation
INSERT INTO categories (name, parent_id, color, icon, sort_order) VALUES
('Transportation', NULL, '#3B82F6', 'car', 2);

WITH transport_parent AS (
  SELECT id FROM categories WHERE name = 'Transportation' AND parent_id IS NULL
)
INSERT INTO categories (name, parent_id, color, icon, sort_order)
SELECT 'Gas', id, '#3B82F6', 'zap', 1 FROM transport_parent
UNION ALL
SELECT 'Public Transit', id, '#3B82F6', 'car', 2 FROM transport_parent
UNION ALL
SELECT 'Parking', id, '#3B82F6', 'home', 3 FROM transport_parent;

-- Parent: Utilities
INSERT INTO categories (name, parent_id, color, icon, sort_order) VALUES
('Utilities', NULL, '#10B981', 'zap', 3);

WITH utilities_parent AS (
  SELECT id FROM categories WHERE name = 'Utilities' AND parent_id IS NULL
)
INSERT INTO categories (name, parent_id, color, icon, sort_order)
SELECT 'Electricity', id, '#10B981', 'zap', 1 FROM utilities_parent
UNION ALL
SELECT 'Water', id, '#10B981', 'home', 2 FROM utilities_parent
UNION ALL
SELECT 'Internet', id, '#10B981', 'smartphone', 3 FROM utilities_parent;

-- Parent: Entertainment
INSERT INTO categories (name, parent_id, color, icon, sort_order) VALUES
('Entertainment', NULL, '#8B5CF6', 'tv', 4);

WITH entertainment_parent AS (
  SELECT id FROM categories WHERE name = 'Entertainment' AND parent_id IS NULL
)
INSERT INTO categories (name, parent_id, color, icon, sort_order)
SELECT 'Movies', id, '#8B5CF6', 'tv', 1 FROM entertainment_parent
UNION ALL
SELECT 'Games', id, '#8B5CF6', 'gift', 2 FROM entertainment_parent
UNION ALL
SELECT 'Subscriptions', id, '#8B5CF6', 'smartphone', 3 FROM entertainment_parent;
```

Run this in Supabase SQL Editor.

---

## Done!

When you can create, view, and edit categories with the hierarchical structure, you're ready for the checkpoint.

**Next**: Run through `checkpoint.md` to verify everything works.
