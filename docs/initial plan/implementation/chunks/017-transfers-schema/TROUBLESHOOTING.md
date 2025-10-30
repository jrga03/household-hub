# Troubleshooting: Transfers Schema

---

## Problem: Trigger not firing

**Solution**: Check trigger exists:

```sql
\dS transactions
```

Recreate if missing:

```sql
DROP TRIGGER IF EXISTS ensure_transfer_integrity ON transactions;
CREATE TRIGGER ensure_transfer_integrity
BEFORE INSERT OR UPDATE ON transactions
FOR EACH ROW EXECUTE FUNCTION check_transfer_integrity();
```

---

## Problem: Cannot create valid transfer

**Cause**: Creating in wrong order or using different accounts

**Solution**: Create expense first, then income with exact same amount and opposite type

---

## Problem: Deletion doesn't unpair

**Solution**: Verify deletion trigger exists and is BEFORE DELETE

---

## Problem: Transfers appearing in analytics

**Cause**: Forgot WHERE transfer_group_id IS NULL

**Solution**: Always add:

```sql
WHERE transfer_group_id IS NULL
```

---

**Quick Fix**: Reset migration and reapply
