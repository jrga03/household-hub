# Checkpoint: Categories Setup

Run these verifications to ensure the category system works correctly.

---

## 1. Database Has Categories ✓

```sql
-- Run in Supabase SQL Editor
SELECT
  parent.name as parent_name,
  child.name as child_name,
  child.color,
  child.icon,
  child.sort_order
FROM categories child
LEFT JOIN categories parent ON child.parent_id = parent.id
WHERE child.is_active = true
ORDER BY parent.sort_order, child.sort_order;
```

**Expected**: At least 4 parent categories (Food, Transportation, Utilities, Entertainment) with 3-4 children each.

---

## 2. Categories Route Loads ✓

```bash
npm run dev
```

Navigate to `http://localhost:3000/categories`

**Visual checks**:

- [ ] Page loads without errors
- [ ] Parent categories displayed as cards
- [ ] Child categories shown within parent cards
- [ ] Colors visible on left border
- [ ] "Add Category" button in header
- [ ] No console errors

---

## 3. Hierarchical Display Works ✓

**Check parent categories**:

- [ ] Each parent shows as a separate card
- [ ] Parent name displayed prominently
- [ ] Shows count of subcategories
- [ ] Edit button visible for each parent
- [ ] Color border on left side

**Check child categories**:

- [ ] Children grouped under correct parent
- [ ] Each child shows in a grid layout
- [ ] Child names visible
- [ ] Color indicators present
- [ ] Clicking child opens edit dialog

---

## 4. Create Parent Category ✓

1. Click "Add Category" button
2. Enter name: "Housing"
3. Leave "Parent Category" as "None"
4. Select green color (#10B981)
5. Select "home" icon
6. Click "Create"

**Expected**:

- [ ] Dialog closes
- [ ] New "Housing" parent category appears
- [ ] Shows 0 subcategories
- [ ] Color and icon correct
- [ ] No errors in console

---

## 5. Create Child Category ✓

1. Find "Housing" parent category
2. Click "Add subcategory" button
3. Enter name: "Rent"
4. Parent should be pre-selected as "Housing"
5. Select color and icon
6. Click "Create"

**Expected**:

- [ ] Dialog closes
- [ ] "Rent" appears under "Housing"
- [ ] Count updates to "1 subcategory"
- [ ] Child displays correctly
- [ ] No errors

---

## 6. Edit Category ✓

1. Click any child category (e.g., "Groceries")
2. Dialog opens with existing data
3. Change name to "Groceries & Supplies"
4. Change color to different shade
5. Click "Update"

**Expected**:

- [ ] Dialog closes
- [ ] Name updates in list
- [ ] Color changes visible
- [ ] Changes persist on page reload
- [ ] No errors

---

## 7. Color Picker Works ✓

**Test Case 1: Select color**

1. Open category form
2. Click on color picker
3. Click different color swatches
4. **Expected**: Selected color shows ring/highlight

**Test Case 2: Color persists**

1. Select red color (#EF4444)
2. Save category
3. Reopen form
4. **Expected**: Red color is selected

---

## 8. Icon Picker Works ✓

**Test Case 1: Select icon**

1. Open category form
2. Scroll through icon grid
3. Click "shopping-cart" icon
4. **Expected**: Icon shows as selected

**Test Case 2: Icon displays**

1. Save category with icon
2. Check category list
3. **Expected**: Icon appears next to category name

---

## 9. Parent Selector Works ✓

**Test Case 1: Create parent**

1. Open form
2. Parent dropdown shows "None (Parent Category)"
3. Leave as None
4. **Expected**: Creates top-level category

**Test Case 2: Create child**

1. Open form
2. Select parent from dropdown
3. **Expected**:
   - Only parent categories in list
   - Selected parent displays
   - Child created under correct parent

**Test Case 3: Can't nest too deep**

1. Try to select a child as parent
2. **Expected**: Children not in parent dropdown

---

## 10. Query Hooks Work ✓

Open browser console and test:

```javascript
// Should fetch all categories
const { data } = useCategories();
console.log(data); // Array of categories

// Should group by parent
const { data: grouped } = useCategoriesGrouped();
console.log(grouped); // Array of parents with children
```

**Expected**:

- Categories load without errors
- Grouped structure correct
- Parent-child relationships intact

---

## 11. Sort Order Works ✓

**Test Case 1: Default ordering**

1. View category list
2. **Expected**: Categories appear in sort_order sequence

**Test Case 2: Change sort order**

1. Edit category
2. Change sort_order to 99
3. Save
4. **Expected**: Category moves to bottom of its group

---

## 12. Validation Works ✓

**Test Case 1: Empty name**

1. Open form
2. Leave name empty
3. Click Create
4. **Expected**: "Name is required" error

**Test Case 2: Name too long**

1. Enter 100-character name
2. **Expected**: "Name too long" error

**Test Case 3: No icon selected**

1. Clear icon (if possible)
2. **Expected**: Validation error or default icon used

---

## 13. Category Form Integration ✓

Verify form connects properly:

```typescript
// CategoryFormDialog should:
// 1. Load existing data when editing
// 2. Reset form on cancel
// 3. Clear form after successful save
// 4. Show loading state during save
// 5. Display errors if save fails
```

**Manual test**:

1. Open edit dialog
2. Click Cancel
3. **Expected**: No changes saved
4. Open create dialog
5. Fill form
6. Click Create
7. **Expected**: Form clears, dialog closes

---

## 14. Accessibility Check ✓

**Keyboard Navigation**:

- [ ] Can tab to "Add Category" button
- [ ] Can tab through form fields
- [ ] Can select colors with keyboard
- [ ] Can select icons with keyboard
- [ ] Can submit form with Enter key

**ARIA Labels**:

```html
<!-- Color buttons should have: -->
<button aria-label="Select Red color">
  <!-- Icon buttons should have: -->
  <button aria-label="Select shopping-cart icon"></button>
</button>
```

**Screen Reader** (optional):

- [ ] Form fields announce correctly
- [ ] Error messages announced
- [ ] Button purposes clear

---

## 15. Error Handling ✓

**Test Case 1: Network error**

1. Disconnect internet
2. Try to create category
3. **Expected**: Error message displays

**Test Case 2: Duplicate name**

1. Try to create category with existing name
2. **Expected**: Error handled gracefully

**Test Case 3: Invalid data**

1. Manually modify form data to invalid values
2. **Expected**: Validation catches it

---

## 16. Data Persistence ✓

**Test Case 1: Reload page**

1. Create new category
2. Refresh page
3. **Expected**: Category still exists

**Test Case 2: Multiple tabs**

1. Open categories page in two tabs
2. Create category in tab 1
3. Reload tab 2
4. **Expected**: New category appears

---

## Success Criteria

- [ ] At least 12 categories seeded (4 parents, 8+ children)
- [ ] Categories page displays correctly
- [ ] Hierarchical structure visible
- [ ] Can create parent categories
- [ ] Can create child categories
- [ ] Can edit existing categories
- [ ] Color picker functional
- [ ] Icon picker functional
- [ ] Parent selector works
- [ ] Sort order respected
- [ ] Validation catches errors
- [ ] Keyboard navigation works
- [ ] Data persists across reloads

---

## Common Issues

### Issue: Categories don't load

**Solution**: Check Supabase connection, run seed script

### Issue: Icons don't display

**Solution**: Verify Lucide React icons imported correctly

### Issue: Can't create child category

**Solution**: Ensure parent_id is set correctly in form

### Issue: Colors not showing

**Solution**: Check Tailwind CSS includes color values

---

## Next Steps

Once all checkpoints pass:

1. Delete any test categories
2. Verify seed data is clean
3. Commit categories code
4. Move to **Chunk 008: Transactions Schema**

---

**Estimated Time**: 10-15 minutes to verify all checkpoints
