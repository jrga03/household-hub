# Troubleshooting: E2E Tests

---

## Test Failures

### Problem: "page.goto: net::ERR_CONNECTION_REFUSED"

**Cause**: Preview server not running

**Solution**:

```bash
# Start preview server first
npm run build
npm run preview

# Then run tests in new terminal
npm run test:e2e
```

---

### Problem: Tests timeout

**Cause**: Slow operations or network delays

**Solution**: Increase timeout

```typescript
test("slow test", async ({ page }) => {
  test.setTimeout(60000); // 60s
  // ...
});
```

---

### Problem: Flaky tests (pass sometimes, fail sometimes)

**Causes & Solutions**:

1. **Race conditions**:

   ```typescript
   // Bad
   await page.click("button");
   expect(page.getByText("Success")).toBeVisible();

   // Good
   await page.click("button");
   await expect(page.getByText("Success")).toBeVisible();
   ```

2. **Timing issues**:
   ```typescript
   // Use waitForSelector
   await page.waitForSelector('[data-loaded="true"]');
   ```

---

## Accessibility Issues

### Problem: Accessibility violations found

**Debug**:

```typescript
const results = await new AxeBuilder({ page }).analyze();
console.log(results.violations);
```

**Common fixes**:

- Add ARIA labels
- Fix color contrast
- Add alt text to images
- Ensure keyboard navigation

---

## Performance Issues

### Problem: Performance tests fail

**Solutions**:

1. **Increase limits**:

   ```typescript
   expect(loadTime).toBeLessThan(5000); // 5s instead of 3s
   ```

2. **Check actual performance**:
   ```typescript
   const timing = await page.evaluate(
     () => performance.timing.loadEventEnd - performance.timing.navigationStart
   );
   console.log("Load time:", timing);
   ```

---

## CI Issues

### Problem: Tests pass locally but fail in CI

**Causes**:

- Different browser versions
- Slower CI environment
- Missing dependencies

**Solutions**:

1. **Install dependencies in CI**:

   ```yaml
   - name: Install Playwright
     run: npx playwright install --with-deps
   ```

2. **Increase timeouts for CI**:
   ```typescript
   const timeout = process.env.CI ? 60000 : 30000;
   test.setTimeout(timeout);
   ```

---

## Quick Fixes

```bash
# Clear Playwright cache
rm -rf ~/.cache/ms-playwright
npx playwright install

# Regenerate screenshots
npx playwright test --update-snapshots

# Run single test with debug
npx playwright test auth.spec.ts --debug

# Run headed (see browser)
npx playwright test --headed
```
