import { useEffect } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { useCategories, useCreateCategory, useUpdateCategory } from "@/lib/supabaseQueries";
import { toast } from "sonner";

const categorySchema = z.object({
  name: z.string().min(1, "Name is required").max(50, "Name too long"),
  parent_id: z.string().nullable(),
  color: z.string().regex(/^#[0-9A-F]{6}$/i, "Invalid color"),
  icon: z.string().min(1, "Icon is required"),
  sort_order: z.number().min(0),
});

type CategoryFormData = z.infer<typeof categorySchema>;

interface Props {
  open: boolean;
  onClose: () => void;
  editingId?: string | null;
  defaultParentId?: string | null;
}

export function CategoryFormDialog({ open, onClose, editingId, defaultParentId }: Props) {
  const { data: categories } = useCategories();
  const createCategory = useCreateCategory();
  const updateCategory = useUpdateCategory();

  const form = useForm<CategoryFormData>({
    resolver: zodResolver(categorySchema),
    defaultValues: {
      name: "",
      parent_id: defaultParentId ?? null,
      color: "#6B7280",
      icon: "folder",
      sort_order: 0,
    },
  });

  // Watch form values using useWatch (React Compiler compatible)
  const parentId = useWatch({ control: form.control, name: "parent_id" });
  const color = useWatch({ control: form.control, name: "color" });
  const icon = useWatch({ control: form.control, name: "icon" });

  // Load existing category data when editing or reset form when closing
  useEffect(() => {
    if (!open) {
      // Reset form when dialog closes to clear any dirty state
      form.reset({
        name: "",
        parent_id: null,
        color: "#6B7280",
        icon: "folder",
        sort_order: 0,
      });
      return;
    }

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
    } else {
      // Creating new category
      form.reset({
        name: "",
        parent_id: defaultParentId ?? null,
        color: "#6B7280",
        icon: "folder",
        sort_order: 0,
      });
    }
  }, [open, editingId, categories, form, defaultParentId]);

  const onSubmit = async (data: CategoryFormData) => {
    try {
      if (editingId) {
        await updateCategory.mutateAsync({
          id: editingId,
          updates: data,
        });
        toast.success("Category updated successfully");
      } else {
        await createCategory.mutateAsync(data);
        toast.success("Category created successfully");
      }

      form.reset();
      onClose();
    } catch (error) {
      console.error("Failed to save category:", error);

      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      const action = editingId ? "update" : "create";

      toast.error(`Failed to ${action} category: ${errorMessage}`);
    }
  };

  // Get parent categories only (filter out children and prevent circular references)
  const parentCategories =
    categories?.filter((c) => {
      // Prevent selecting self as parent (circular reference)
      if (editingId && c.id === editingId) {
        return false;
      }
      // Only show actual parent categories
      return c.parent_id === null;
    }) ?? [];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editingId ? "Edit Category" : "Create Category"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          {/* Name */}
          <div>
            <Label htmlFor="name">Category Name</Label>
            <Input
              id="name"
              {...form.register("name")}
              placeholder="e.g., Groceries"
              aria-invalid={!!form.formState.errors.name}
            />
            {form.formState.errors.name && (
              <p className="text-sm text-destructive mt-1">{form.formState.errors.name.message}</p>
            )}
          </div>

          {/* Parent Category */}
          <div>
            <Label htmlFor="parent_id">Parent Category (optional)</Label>
            <Select
              value={parentId ?? "none"}
              onValueChange={(value) => form.setValue("parent_id", value === "none" ? null : value)}
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
            <ColorPicker value={color} onChange={(color) => form.setValue("color", color)} />
            {form.formState.errors.color && (
              <p className="text-sm text-destructive mt-1">{form.formState.errors.color.message}</p>
            )}
          </div>

          {/* Icon */}
          <div>
            <Label>Icon</Label>
            <IconPicker value={icon} onChange={(icon) => form.setValue("icon", icon)} />
            {form.formState.errors.icon && (
              <p className="text-sm text-destructive mt-1">{form.formState.errors.icon.message}</p>
            )}
          </div>

          {/* Sort Order */}
          <div>
            <Label htmlFor="sort_order">Sort Order</Label>
            <Input
              id="sort_order"
              type="number"
              {...form.register("sort_order", { valueAsNumber: true })}
              aria-invalid={!!form.formState.errors.sort_order}
            />
            {form.formState.errors.sort_order && (
              <p className="text-sm text-destructive mt-1">
                {form.formState.errors.sort_order.message}
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 mt-6">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? "Saving..." : editingId ? "Update" : "Create"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
