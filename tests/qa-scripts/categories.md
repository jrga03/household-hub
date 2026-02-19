# Categories - QA Test Scripts

---

## Test ID: CAT-001

## Create parent category

## Priority: High

### Preconditions

- Logged in as test@example.com

### Steps

1. Navigate to `http://localhost:3000/categories`
2. Click "Add Category" button (`[data-testid="add-category-btn"]` or `button:has-text("Add")`)
3. Enter "[E2E] Test Category Parent" in the Name field (`input[name="name"]`)
4. Select a color if color picker is available
5. Select "expense" as the type if type selector exists
6. Click "Save" or "Create" button

### Expected Results

- [ ] Toast notification: "Category created" or similar
- [ ] New category appears in the category list
- [ ] Category name shows "[E2E] Test Category Parent"
- [ ] Category is displayed at the top level (not nested under another)

### Cleanup

1. Delete the "[E2E] Test Category Parent" category

---

## Test ID: CAT-002

## Create child category under parent

## Priority: High

### Preconditions

- Logged in as test@example.com
- A parent category exists (e.g., "Food")

### Steps

1. Navigate to `http://localhost:3000/categories`
2. Find the "Food" parent category
3. Click "Add Subcategory" or the "+" icon on the parent row (`[data-testid="add-subcategory"]`)
4. Enter "[E2E] Test Subcategory" in the Name field
5. Click "Save"

### Expected Results

- [ ] Toast notification confirms creation
- [ ] Subcategory appears nested under "Food" parent
- [ ] Visual indentation or tree structure shows the hierarchy
- [ ] Subcategory inherits the parent's type (expense/income)

### Cleanup

1. Delete the "[E2E] Test Subcategory" category

---

## Test ID: CAT-003

## Edit category name

## Priority: Medium

### Preconditions

- Logged in as test@example.com
- A category exists to edit (create one per CAT-001 if needed)

### Steps

1. Navigate to `http://localhost:3000/categories`
2. Find the "[E2E] Test Category Parent" category
3. Click "Edit" or the pencil icon
4. Change the name to "[E2E] Renamed Category"
5. Click "Save"

### Expected Results

- [ ] Toast notification: "Category updated" or similar
- [ ] Category name updates in the list to "[E2E] Renamed Category"
- [ ] Existing transactions linked to this category still show the updated name
- [ ] No other category properties changed

### Cleanup

1. Delete the "[E2E] Renamed Category" category

---

## Test ID: CAT-004

## Delete category

## Priority: Medium

### Preconditions

- Logged in as test@example.com
- An [E2E] test category exists with no transactions linked to it

### Steps

1. Navigate to `http://localhost:3000/categories`
2. Find the "[E2E]" test category
3. Click the "..." menu or delete icon
4. Click "Delete"
5. Confirm deletion in the dialog

### Expected Results

- [ ] Confirmation dialog warns about deletion
- [ ] Toast notification confirms deletion
- [ ] Category is removed from the list
- [ ] If category has transactions, warning about uncategorized transactions appears

### Cleanup

None needed (category is already deleted)

---

## Test ID: CAT-005

## Verify hierarchy display

## Priority: Medium

### Preconditions

- Logged in as test@example.com
- Parent-child category relationships exist (e.g., Food > Groceries, Food > Dining Out)

### Steps

1. Navigate to `http://localhost:3000/categories`
2. Examine the category list structure
3. Look for visual hierarchy indicators

### Expected Results

- [ ] Parent categories are displayed at the top level
- [ ] Child categories are visually nested (indented, collapsible, or tree-view)
- [ ] Each child clearly belongs to its parent
- [ ] Expanding/collapsing parents shows/hides children (if collapsible)
- [ ] Category count shows total including subcategories

### Cleanup

None needed (read-only)
