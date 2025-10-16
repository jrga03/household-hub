# Troubleshooting: Categories Setup

Common issues and solutions when working with the category management system.

---

## Categories Don't Load

### Problem: "No categories yet" shows even after seeding

**Symptoms**:

- Ran seed script
- Categories page shows empty state
- No errors in console

**Cause**: RLS policies blocking access OR seed script failed

**Solution 1 - Check RLS**:

```sql
-- In Supabase SQL Editor
SELECT * FROM categories;
```

If this returns data but UI doesn't show it, RLS is blocking access.

Fix RLS policy:

```sql
-- Verify policy exists
SELECT * FROM pg_policies WHERE tablename = 'categories';

-- Recreate policy if needed
DROP POLICY IF EXISTS "View categories" ON categories;
CREATE POLICY "View categories"
  ON categories FOR SELECT
  TO authenticated
  USING (true);
```

**Solution 2 - Check seed data**:

```sql
-- Verify categories exist
SELECT COUNT(*) FROM categories WHERE is_active = true;
-- Should return 12+ rows

-- Check parent-child relationships
SELECT
  COUNT(*) FILTER (WHERE parent_id IS NULL) as parents,
  COUNT(*) FILTER (WHERE parent_id IS NOT NULL) as children
FROM categories;
-- Should show 4 parents, 8+ children
```

---

## Hierarchical Display Broken

### Problem: All categories show flat, no parent-child structure

**Symptoms**:

- Categories load
- All display at same level
- No grouping by parent

**Cause**: `useCategoriesGrouped` logic error

**Solution**:
Check the grouping logic in `supabaseQueries.ts`:

```typescript
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

      // CRITICAL: Filter parents first, then add children
      const grouped = categories
        .filter((c) => c.parent_id === null) // Get parents only
        .map((parent) => ({
          ...parent,
          children: categories.filter((c) => c.parent_id === parent.id),
        }));

      return grouped;
    },
  });
}
```

---

## Icons Not Displaying

### Problem: Icon names show but actual icons don't render

**Symptoms**:

- Icon picker shows empty squares
- Category list shows text instead of icons
- Console shows "Component not found" warnings

**Cause**: Lucide icon name doesn't match import

**Solution**:
Fix icon name transformation in `icon-picker.tsx`:

```typescript
// Incorrect:
const IconComponent = LucideIcons[iconName];

// Correct: Convert kebab-case to PascalCase
const IconComponent =
  LucideIcons[
    iconName
      .split("-")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join("")
  ];

// Example: "shopping-cart" → "ShoppingCart"
```

Also ensure all icon names in CATEGORY_ICONS array match available Lucide icons.

**Verify Icon Names**:

```typescript
// Test all CATEGORY_ICONS map correctly
import * as LucideIcons from "lucide-react";
import { CATEGORY_ICONS } from "@/types/categories";

CATEGORY_ICONS.forEach((iconName) => {
  const pascalCase = iconName
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("");

  if (!LucideIcons[pascalCase as keyof typeof LucideIcons]) {
    console.error(`Icon not found: ${iconName} → ${pascalCase}`);
  }
});
```

Valid icon names from current CATEGORY_ICONS:

- `folder` → `Folder` ✓
- `shopping-cart` → `ShoppingCart` ✓
- `utensils` → `Utensils` ✓
- `car` → `Car` ✓
- `home` → `Home` ✓
- `zap` → `Zap` ✓
- `tv` → `Tv` ✓
- `heart` → `Heart` ✓
- `briefcase` → `Briefcase` ✓
- `gift` → `Gift` ✓
- `coffee` → `Coffee` ✓
- `smartphone` → `Smartphone` ✓

---

## Color Picker Issues

### Problem: Selected color doesn't show ring/highlight

**Symptoms**:

- Click color swatch
- No visual feedback
- Color seems selected but no indicator

**Cause**: Tailwind CSS classes not applied or value comparison issue

**Solution**:
Verify color picker logic:

```typescript
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
            value === color.value // ← Exact match check
              ? "border-primary ring-2 ring-primary ring-offset-2"
              : "border-transparent hover:scale-110"
          )}
          style={{ backgroundColor: color.value }}
        />
      ))}
    </div>
  );
}
```

Ensure `value` prop is the hex string, not an object.

---

## Parent Selector Shows Children

### Problem: Can select child categories as parents (infinite nesting)

**Symptoms**:

- Parent dropdown shows all categories
- Can create circular references
- Creates invalid hierarchy

**Cause**: Not filtering categories by parent_id

**Solution**:
Filter to parent categories only:

```typescript
// In CategoryFormDialog
const parentCategories = categories?.filter((c) => c.parent_id === null) || [];

// Then use in Select:
<SelectContent>
  <SelectItem value="none">None (Parent Category)</SelectItem>
  {parentCategories.map((category) => (
    <SelectItem key={category.id} value={category.id}>
      {category.name}
    </SelectItem>
  ))}
</SelectContent>
```

---

## Form Doesn't Save

### Problem: Click "Create" but category doesn't appear

**Symptoms**:

- Form submits
- No error shown
- Category not in list
- No console errors

**Cause**: Mutation succeeds but cache not invalidated

**Solution**:
Ensure `onSuccess` invalidates queries:

```typescript
export function useCreateCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (category: CategoryInsert) => {
      const { data, error } = await supabase.from("categories").insert(category).select().single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      // ← CRITICAL: Invalidate ALL category queries
      queryClient.invalidateQueries({ queryKey: ["categories"] });
    },
  });
}
```

---

## Edit Doesn't Load Existing Data

### Problem: Open edit dialog, form shows defaults not existing values

**Symptoms**:

- Click edit on category
- Dialog opens
- Fields are empty or show defaults
- Should show existing category data

**Cause**: useEffect dependency or timing issue

**Solution**:
Fix useEffect in CategoryFormDialog:

```typescript
useEffect(() => {
  if (editingId && categories && open) {
    // ← Add 'open' check
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
}, [editingId, categories, open, form]); // ← Include all dependencies
```

---

## Can't Delete/Archive Category

### Problem: Archive button doesn't work or category still shows

**Symptoms**:

- Click archive/delete
- No error
- Category still visible

**Cause**: Query filter only shows active categories but archive didn't work

**Solution 1 - Check mutation**:

```typescript
export function useArchiveCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("categories")
        .update({ is_active: false }) // ← Soft delete
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
    },
  });
}
```

**Solution 2 - Prevent deleting parent with children**:

```typescript
// Before archiving, check for children
const { data: children } = await supabase
  .from("categories")
  .select("id")
  .eq("parent_id", categoryId)
  .eq("is_active", true);

if (children && children.length > 0) {
  throw new Error("Cannot delete category with active subcategories");
}
```

---

## Sort Order Not Working

### Problem: Categories appear in wrong order

**Symptoms**:

- Set sort_order values
- Categories don't sort correctly
- Random or alphabetical order instead

**Cause**: Query missing ORDER BY or wrong order

**Solution**:
Fix query order:

```typescript
const { data, error } = await supabase
  .from("categories")
  .select("*")
  .eq("is_active", true)
  .order("parent_id", { ascending: true, nullsFirst: true }) // ← Parents first
  .order("sort_order", { ascending: true }) // ← Then by sort_order
  .order("name", { ascending: true }); // ← Finally by name
```

---

## TypeScript Errors

### Problem: "Property 'children' does not exist on type 'Category'"

**Symptoms**:

```typescript
categories.map((cat) => cat.children); // ← Error here
```

**Cause**: Using wrong type

**Solution**:
Use `CategoryWithChildren` type:

```typescript
// In types/categories.ts
export interface CategoryWithChildren extends Category {
  children: Category[];
}

// In component
const { data: categories } = useCategoriesGrouped();
// categories is CategoryWithChildren[]
```

---

## Performance Issues

### Problem: Category list slow with many categories

**Symptoms**:

- Page lags when rendering
- Scrolling stutters
- Many categories (100+)

**Cause**: Too many re-renders or no virtualization

**Solution 1 - Memoize components**:

```typescript
const CategoryCard = React.memo(({ category }: { category: CategoryWithChildren }) => {
  // ...
});
```

**Solution 2 - Add pagination** (if needed):

```typescript
const [page, setPage] = useState(0);
const CATEGORIES_PER_PAGE = 20;

const displayedCategories = categories.slice(
  page * CATEGORIES_PER_PAGE,
  (page + 1) * CATEGORIES_PER_PAGE
);
```

---

## Seed Script Fails

### Problem: SQL seed script returns errors

**Symptoms**:

- Run seed script
- Get SQL errors
- Categories not created

**Common Causes**:

1. **Duplicate names**:

```sql
-- Check for existing categories first
SELECT * FROM categories WHERE name IN ('Food', 'Transportation');

-- Delete if needed
DELETE FROM categories WHERE name IN ('Food', 'Transportation');
```

2. **Foreign key constraint**:

```sql
-- Ensure parent_id UUIDs are valid
-- Use CTE to get parent IDs dynamically (as in seed script)
```

3. **Missing household_id**:

```sql
-- If household_id required, add default:
INSERT INTO categories (name, household_id, ...)
VALUES ('Food', '00000000-0000-0000-0000-000000000001', ...);
```

---

## Form Validation Not Working

### Problem: Can submit form with invalid data

**Symptoms**:

- Leave name empty
- Form submits anyway
- Invalid data reaches database

**Cause**: Zod schema not applied or validation bypassed

**Solution**:
Verify form setup:

```typescript
const form = useForm<CategoryFormData>({
  resolver: zodResolver(categorySchema), // ← Must be here
  defaultValues: { ... },
});

// And in form:
<form onSubmit={form.handleSubmit(onSubmit)}> // ← Use handleSubmit
```

Also check schema:

```typescript
const categorySchema = z.object({
  name: z.string().min(1, "Name is required").max(50),
  parent_id: z.string().nullable(),
  // ... other fields
});
```

---

## Prevention Tips

1. **Always filter active**: `WHERE is_active = true`
2. **Order by sort_order**: Consistent ordering
3. **Validate parent_id**: Prevent circular references
4. **Invalidate cache**: After mutations
5. **Handle errors**: Show user-friendly messages
6. **Test hierarchy**: Create parent → child → grandchild (should fail)

---

## Quick Fixes

```bash
# Reset categories (WARNING: Deletes all)
# In Supabase SQL Editor:
DELETE FROM categories;

# Re-run seed script
# Copy/paste from scripts/seed-categories.sql

# Clear React Query cache
# In browser console:
queryClient.clear();

# Force refetch
queryClient.invalidateQueries({ queryKey: ["categories"] });
```

---

## Getting Help

If you're stuck:

1. Check this troubleshooting guide
2. Verify RLS policies in Supabase
3. Check browser console for errors
4. Inspect React Query DevTools
5. Test queries directly in Supabase SQL Editor
6. Check TanStack Query cache state

---

**Remember**: Categories are the foundation of transaction organization. Test thoroughly before building transactions (chunk 009).
