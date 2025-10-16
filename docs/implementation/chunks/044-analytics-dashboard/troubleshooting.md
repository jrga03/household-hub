# Troubleshooting: Analytics Dashboard

---

## Chart Issues

### Problem: Charts not rendering

**Symptoms**: Blank space where charts should be

**Solutions**:

1. **Check data format**:

   ```typescript
   console.log("Chart data:", data);
   // Verify it's an array with correct shape
   ```

2. **Check container size**:

   ```typescript
   // ResponsiveContainer needs parent with height
   <div style={{ height: 400 }}>
     <ResponsiveContainer>...
   </div>
   ```

3. **Verify Recharts imported**:
   ```typescript
   import { LineChart, ... } from 'recharts';
   ```

---

### Problem: "Cannot read property 'map' of undefined"

**Cause**: Data not loaded yet

**Solution**: Add loading/empty states

```typescript
if (!data?.monthlyTrend) {
  return <div>No data available</div>;
}
```

---

## Data Issues

### Problem: Transfers appearing in analytics

**Cause**: Missing `transfer_group_id IS NULL` filter

**Solution**: Verify query:

```typescript
.is('transfer_group_id', null)  // Add this!
```

---

### Problem: Wrong totals displayed

**Causes**:

1. Not dividing by 100 (cents → pesos)
2. Including transfers
3. Wrong date range

**Solution**: Debug totals:

```typescript
console.log("Raw total:", rawTotal);
console.log("Formatted:", rawTotal / 100);
```

---

## Performance Issues

### Problem: Slow chart rendering

**Solution**: Limit data points

```typescript
// Only show last 12 months
const data = allData.slice(-12);
```

---

## Quick Fixes

```bash
# Reinstall recharts
npm uninstall recharts
npm install recharts

# Clear cache
rm -rf node_modules/.vite
npm run dev
```
