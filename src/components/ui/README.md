# UI Primitives (`/src/components/ui/`)

## Purpose

UI component library combining **shadcn/ui primitives** (26 components) with **custom components** (4 components) for the Household Hub application. All components built with Tailwind CSS v4 and Radix UI primitives.

## Directory Contents

**30 component files:**

### shadcn/ui Primitives (26 components)

Standard shadcn/ui components - see [shadcn/ui documentation](https://ui.shadcn.com/) for full API:

- `alert.tsx` - Alert messages
- `badge.tsx` - Status badges and labels
- `button.tsx` - Button variants and sizes
- `calendar.tsx` - Date picker calendar
- `card.tsx` - Card containers (Card, CardHeader, CardTitle, CardContent, CardFooter)
- `dialog.tsx` - Modal dialogs
- `dropdown-menu.tsx` - Dropdown menus
- `form.tsx` - Form field wrappers (React Hook Form integration)
- `input.tsx` - Text inputs
- `label.tsx` - Form labels
- `popover.tsx` - Popover overlays
- `progress.tsx` - Progress bars
- `radio-group.tsx` - Radio button groups
- `scroll-area.tsx` - Scrollable containers
- `select.tsx` - Dropdown selects
- `separator.tsx` - Visual dividers
- `sheet.tsx` - Side drawer/sheet
- `sidebar.tsx` - Collapsible sidebar
- `skeleton.tsx` - Loading skeletons
- `sonner.tsx` - Toast notifications (Sonner integration)
- `switch.tsx` - Toggle switches
- `table.tsx` - Data tables
- `textarea.tsx` - Multi-line text inputs
- `tooltip.tsx` - Hover tooltips

**Installation:** These were installed via shadcn/ui CLI:

```bash
npx shadcn@latest add [component-name]
```

### Custom Components (4 components)

**Application-specific components built on top of shadcn/ui:**

1. **`category-selector.tsx`** - Category dropdown with parent/child hierarchy
2. **`color-picker.tsx`** - Color selection input for categories
3. **`currency-input.tsx`** - PHP currency input with formatting
4. **`date-picker.tsx`** - Enhanced date picker with calendar popover
5. **`icon-picker.tsx`** - Icon selection from Lucide React library

### Example/Demo Files

- `currency-input.example.tsx` - Usage examples for CurrencyInput

## Custom Component Details

### category-selector.tsx

**Purpose:** Select categories with parent/child relationship support

**Features:**

- Grouped select (parents with nested children)
- Visual hierarchy (indentation or grouping)
- Used in: Transaction form, Budget form

**Props:**

```typescript
{
  value: string;              // Selected category ID
  onChange: (id: string) => void;
  disabled?: boolean;
  placeholder?: string;
}
```

**Behavior:**

- Fetches categories from database
- Groups by parent category
- Shows flat list or hierarchy based on design

### color-picker.tsx

**Purpose:** Pick colors for category visual identification

**Features:**

- Predefined color palette or custom picker
- Color preview
- Used in: Category creation/edit forms

**Props:**

```typescript
{
  value: string;              // Hex color (#ef4444)
  onChange: (color: string) => void;
  disabled?: boolean;
}
```

**Common colors:**

- Red (#ef4444), Orange (#f97316), Yellow (#eab308)
- Green (#22c55e), Blue (#3b82f6), Purple (#a855f7)
- Pink (#ec4899), Gray (#6b7280)

### currency-input.tsx

**Purpose:** PHP currency input with automatic formatting and validation

**Features:**

- ₱ prefix display
- Comma thousand separators
- Decimal handling (.00)
- Stores value as integer cents
- Validates range (₱0.01 to ₱9,999,999.99)

**Props:**

```typescript
{
  value: number;              // Amount in cents
  onChange: (cents: number) => void;
  error?: string;
  disabled?: boolean;
  placeholder?: string;
}
```

**Behavior:**

- User types: "1500" or "1,500" or "1500.50"
- Displays: "₱1,500.00"
- Stores: 150000 (cents)

**Used in:**

- Transaction form
- Transfer form
- Budget form

**See also:** `currency-input.example.tsx` for usage examples

### date-picker.tsx

**Purpose:** Enhanced date picker with calendar popover and keyboard input

**Features:**

- Calendar popover (shadcn/ui Calendar)
- Manual date input
- Date format validation
- Used in: Transaction form, filters

**Props:**

```typescript
{
  value: Date | undefined;
  onChange: (date: Date | undefined) => void;
  disabled?: boolean;
  placeholder?: string;
}
```

**Behavior:**

- Click input → Calendar popover opens
- Select date → Input updates, popover closes
- Type date → Validates and sets

### icon-picker.tsx

**Purpose:** Select icons from Lucide React icon library for categories

**Features:**

- Grid of available icons
- Search/filter functionality
- Icon preview
- Used in: Category creation/edit

**Props:**

```typescript
{
  value: string;              // Icon name (e.g., "ShoppingCart")
  onChange: (iconName: string) => void;
  disabled?: boolean;
}
```

**Common icons:**

- Shopping: ShoppingCart, ShoppingBag
- Food: Utensils, Coffee
- Transport: Car, Bus, Train
- Home: Home, Building
- Health: Heart, Activity

## shadcn/ui Quick Reference

### Form Components

**Input:**

```tsx
<Input type="text" placeholder="Enter name" />
```

**Select:**

```tsx
<Select value={value} onValueChange={onChange}>
  <SelectTrigger>
    <SelectValue placeholder="Choose..." />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="option1">Option 1</SelectItem>
  </SelectContent>
</Select>
```

**Textarea:**

```tsx
<Textarea placeholder="Enter description" rows={4} />
```

**Switch:**

```tsx
<Switch checked={value} onCheckedChange={onChange} />
```

### Layout Components

**Card:**

```tsx
<Card>
  <CardHeader>
    <CardTitle>Title</CardTitle>
  </CardHeader>
  <CardContent>Content here</CardContent>
</Card>
```

**Dialog:**

```tsx
<Dialog open={open} onOpenChange={setOpen}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Dialog Title</DialogTitle>
    </DialogHeader>
    {/* Content */}
  </DialogContent>
</Dialog>
```

**Sheet:**

```tsx
<Sheet open={open} onOpenChange={setOpen}>
  <SheetContent side="left">{/* Drawer content */}</SheetContent>
</Sheet>
```

### Feedback Components

**Button:**

```tsx
<Button variant="default|outline|ghost" size="sm|default|lg">
  Click me
</Button>
```

**Toast (Sonner):**

```tsx
import { toast } from "sonner";

toast.success("Action completed");
toast.error("Action failed");
```

**Progress:**

```tsx
<Progress value={75} className="h-2" />
```

**Skeleton:**

```tsx
<Skeleton className="h-4 w-full" />
```

### Navigation Components

**Dropdown Menu:**

```tsx
<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <Button>Open</Button>
  </DropdownMenuTrigger>
  <DropdownMenuContent>
    <DropdownMenuItem>Item 1</DropdownMenuItem>
    <DropdownMenuItem>Item 2</DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
```

**Tooltip:**

```tsx
<Tooltip>
  <TooltipTrigger>Hover me</TooltipTrigger>
  <TooltipContent>Tooltip text</TooltipContent>
</Tooltip>
```

## Component Variants

### Button Variants

```tsx
<Button variant="default">Default</Button>
<Button variant="destructive">Delete</Button>
<Button variant="outline">Outline</Button>
<Button variant="ghost">Ghost</Button>
<Button variant="link">Link</Button>
```

### Button Sizes

```tsx
<Button size="sm">Small</Button>
<Button size="default">Default</Button>
<Button size="lg">Large</Button>
<Button size="icon">Icon</Button>
```

### Badge Variants

```tsx
<Badge>Default</Badge>
<Badge variant="secondary">Secondary</Badge>
<Badge variant="destructive">Error</Badge>
<Badge variant="outline">Outline</Badge>
```

## Customization

### Tailwind CSS v4

All components use Tailwind CSS v4 utility classes:

- `bg-primary`, `text-primary-foreground` - Primary colors
- `bg-secondary`, `text-secondary-foreground` - Secondary colors
- `bg-muted`, `text-muted-foreground` - Muted colors
- `bg-accent`, `text-accent-foreground` - Accent colors
- `bg-destructive`, `text-destructive-foreground` - Error colors

**CSS variables defined in:** `src/index.css`

### Dark Mode Support

All components support dark mode via Tailwind's `dark:` modifier:

```tsx
<div className="bg-white dark:bg-gray-900">Content</div>
```

**Dark mode toggle:** Implemented in application settings

## Adding New UI Components

### From shadcn/ui

```bash
# Add a new shadcn/ui component
npx shadcn@latest add [component-name]

# Examples
npx shadcn@latest add tabs
npx shadcn@latest add accordion
npx shadcn@latest add collapsible
```

**Components are copied** to `src/components/ui/` - you can customize after installation.

### Custom Components

1. Create new file in `src/components/ui/`
2. Build on top of shadcn/ui primitives
3. Follow existing patterns (category-selector, currency-input)
4. Document props and usage

**Example custom component:**

```tsx
// src/components/ui/my-component.tsx
import { Button } from "./button";
import { Card } from "./card";

export function MyComponent({ value, onChange }) {
  return (
    <Card>
      <Button onClick={() => onChange(value + 1)}>Increment: {value}</Button>
    </Card>
  );
}
```

## Integration with React Hook Form

### Form Component

**Wrap entire form:**

```tsx
<Form {...form}>
  <form onSubmit={form.handleSubmit(onSubmit)}>{/* Form fields */}</form>
</Form>
```

### FormField

**Individual field:**

```tsx
<FormField
  control={form.control}
  name="fieldName"
  render={({ field }) => (
    <FormItem>
      <FormLabel>Field Label</FormLabel>
      <FormControl>
        <Input {...field} />
      </FormControl>
      <FormMessage /> {/* Error message */}
    </FormItem>
  )}
/>
```

### Controller (for Select, etc.)

```tsx
<Controller
  name="categoryId"
  control={form.control}
  render={({ field }) => (
    <FormItem>
      <FormLabel>Category</FormLabel>
      <Select onValueChange={field.onChange} value={field.value}>
        <SelectTrigger>
          <SelectValue placeholder="Select..." />
        </SelectTrigger>
        <SelectContent>
          {options.map((opt) => (
            <SelectItem key={opt.id} value={opt.id}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <FormMessage />
    </FormItem>
  )}
/>
```

## Accessibility (WCAG 2.1 AA)

All shadcn/ui components are built with accessibility:

- **Keyboard navigation:** Tab, Enter, Escape work correctly
- **ARIA attributes:** Proper roles, labels, descriptions
- **Screen reader support:** Meaningful announcements
- **Focus management:** Visible focus indicators
- **Color contrast:** Meets WCAG AA standards

**Custom components must maintain:**

- Semantic HTML
- ARIA labels where needed
- Keyboard accessibility
- Focus management

## Performance

### Bundle Size

shadcn/ui is **copy-paste**, not npm package:

- Only includes components you use
- Tree-shaking eliminates unused code
- Typical overhead: ~5-10KB per component

### Runtime Performance

- Built on Radix UI (optimized primitives)
- Minimal JavaScript
- CSS-only animations where possible
- No re-render issues (properly memoized)

## Common Patterns

### Controlled Components

```tsx
const [value, setValue] = useState("");

<Input value={value} onChange={(e) => setValue(e.target.value)} />;
```

### Uncontrolled with defaultValue

```tsx
<Input defaultValue="Initial" name="fieldName" />
```

### Disabled State

```tsx
<Button disabled={isLoading}>{isLoading ? "Loading..." : "Submit"}</Button>
```

### Loading State

```tsx
{
  isLoading ? <Skeleton className="h-10 w-full" /> : <Input value={data} />;
}
```

## Troubleshooting

### Issue: Component not found

**Check:**

1. Was component installed? (`npx shadcn@latest add [name]`)
2. Import path correct? (`@/components/ui/[name]`)
3. File exists in `src/components/ui/`?

### Issue: Styles not applied

**Check:**

1. Tailwind CSS configured correctly?
2. CSS variables defined in `src/index.css`?
3. Component classes not being purged?

### Issue: Dark mode not working

**Check:**

1. Dark mode toggle implemented?
2. `dark:` classes applied?
3. Tailwind dark mode strategy configured?

## Related Documentation

### shadcn/ui Official Docs

- [Components](https://ui.shadcn.com/docs/components) - Full component list
- [Installation](https://ui.shadcn.com/docs/installation) - Setup guide
- [Theming](https://ui.shadcn.com/docs/theming) - Customization

### Project Documentation

- [/CLAUDE.md](../../../CLAUDE.md) - Project quick reference
- [/src/README.md](../../README.md) - Source code overview
- [/src/components/README.md](../README.md) - Component architecture

### Radix UI

- [Primitives](https://www.radix-ui.com/primitives) - Unstyled component library (shadcn/ui foundation)

## Further Reading

- [Tailwind CSS v4](https://tailwindcss.com/docs) - Utility CSS framework
- [Radix UI](https://www.radix-ui.com/) - Accessible component primitives
- [React Hook Form](https://react-hook-form.com/) - Form library integration
- [Sonner](https://sonner.emilkowal.ski/) - Toast notification library
