# Troubleshooting: CSV Export

---

## Problem: Excel shows garbled characters

**Solution**: Ensure UTF-8 BOM is included:

```typescript
const BOM = "\uFEFF";
return BOM + csvHeaders + "\n" + csvRows;
```

---

## Problem: Commas break columns

**Solution**: Escape values containing commas:

```typescript
if (value.includes(",")) {
  return `"${value}"`;
}
```

---

## Problem: Download doesn't trigger

**Solution**: Check blob creation and URL:

```typescript
const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
const url = URL.createObjectURL(blob);

// Don't forget to revoke!
URL.revokeObjectURL(url);
```

---

## Problem: Large exports crash browser

**Solution**: Use streaming or chunked export for >10k rows:

```typescript
// Process in batches
for (let i = 0; i < transactions.length; i += 1000) {
  const batch = transactions.slice(i, i + 1000);
  // Process batch...
}
```

---

## Quick Fixes

```javascript
// Test CSV generation
const csv = await csvExporter.exportTransactions();
console.log(csv.substring(0, 500)); // Preview first 500 chars

// Check escape function
csvExporter["escapeCsv"]('Test, "quotes"');
```
