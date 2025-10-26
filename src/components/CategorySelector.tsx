import { useCategories } from "@/lib/supabaseQueries";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Category } from "@/types/categories";

interface CategorySelectorProps {
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  error?: string;
}

export function CategorySelector({
  value,
  onChange,
  placeholder = "Select category",
  error,
}: CategorySelectorProps) {
  const { data: categories, isLoading } = useCategories();

  if (isLoading) {
    return (
      <Select disabled>
        <SelectTrigger>
          <SelectValue placeholder="Loading categories..." />
        </SelectTrigger>
      </Select>
    );
  }

  // Group child categories by parent
  const parentCategories = categories?.filter((c) => c.parent_id === null) ?? [];
  const childCategoriesByParent = categories?.reduce(
    (acc, cat) => {
      if (cat.parent_id) {
        if (!acc[cat.parent_id]) {
          acc[cat.parent_id] = [];
        }
        acc[cat.parent_id].push(cat);
      }
      return acc;
    },
    {} as Record<string, Category[]>
  );

  return (
    <div>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className={error ? "border-destructive" : ""}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {parentCategories.map((parent) => (
            <SelectGroup key={parent.id}>
              <SelectLabel className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: parent.color }} />
                {parent.name}
              </SelectLabel>
              {childCategoriesByParent?.[parent.id]?.map((child) => (
                <SelectItem key={child.id} value={child.id}>
                  <div className="flex items-center gap-2">
                    <div
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: child.color }}
                    />
                    {child.name}
                  </div>
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
      {error && <p className="text-sm text-destructive mt-1">{error}</p>}
    </div>
  );
}
