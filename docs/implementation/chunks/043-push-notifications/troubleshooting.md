# Troubleshooting: Push Notifications

---

## Permission Issues

### Problem: Permission prompt never shows

**Cause**: Already denied or browser policy

**Solution**:

1. Check permission status:

   ```javascript
   console.log(Notification.permission);
   ```

2. Reset in browser settings:
   - Chrome: Settings → Privacy → Site Settings → Notifications
   - Safari: Preferences → Websites → Notifications

---

## Subscription Issues

### Problem: "PushManager not available"

**Cause**: Service worker not active or HTTPS required

**Solution**:

```javascript
// Check prerequisites
console.log("SW:", "serviceWorker" in navigator);
console.log("Push:", "PushManager" in window);
console.log("Secure:", window.isSecureContext);
```

---

### Problem: VAPID key error

**Symptoms**: "Invalid VAPID key"

**Solution**: Verify key format:

```javascript
// Must be base64-url encoded, no padding
const key = "BM8xyz..."; // Should start with 'B' usually
```

---

## Notification Issues

### Problem: Notifications don't appear

**Causes & Solutions**:

1. **Do Not Disturb enabled**: Check system settings
2. **Browser closed**: Background notifications require persistent SW
3. **Permission denied**: User blocked notifications

---

### Problem: iOS Safari no notifications

**Cause**: iOS Safari 16.4+ required

**Solution**: Check version, provide fallback UI if not supported

---

## Worker Issues

### Problem: Worker returns 500 error

**Check logs**:

```bash
wrangler tail
```

**Common fixes**:

- Verify secrets set: `wrangler secret list`
- Check subscription format
- Verify VAPID keys match

---

## Quick Fixes

```bash
# Reset everything
wrangler secret delete VAPID_PUBLIC_KEY
wrangler secret delete VAPID_PRIVATE_KEY

# Generate new keys
npx web-push generate-vapid-keys

# Re-add secrets
wrangler secret put VAPID_PUBLIC_KEY
wrangler secret put VAPID_PRIVATE_KEY

# Redeploy
wrangler deploy
```
