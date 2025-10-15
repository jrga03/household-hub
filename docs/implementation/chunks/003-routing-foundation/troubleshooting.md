# Troubleshooting: Routing Foundation

Common issues and solutions for chunk 003.

---

## Issue: Route tree not generating

**Symptom**: `src/routeTree.gen.ts` doesn't exist or is outdated

**Cause**: TanStack Router plugin not configured or not detecting file changes

**Solution**:

1. Verify plugin in `vite.config.ts`:

   ```typescript
   import { TanStackRouterVite } from "@tanstack/router-vite-plugin";

   export default defineConfig({
     plugins: [
       react(),
       TanStackRouterVite(), // Must be present
     ],
   });
   ```

2. Restart dev server completely:

   ```bash
   # Kill server (Ctrl+C)
   npm run dev
   ```

3. Check route file naming:

   ```
   ✅ src/routes/index.tsx
   ✅ src/routes/dashboard.tsx
   ❌ src/routes/Index.tsx (capital I)
   ❌ src/pages/dashboard.tsx (wrong folder)
   ```

4. Manually trigger generation:
   ```bash
   rm src/routeTree.gen.ts
   npm run dev
   ```

**Reference**: `instructions.md` Steps 1 & 8

---

## Issue: TypeScript error "Cannot find module './routeTree.gen'"

**Symptom**:

```
Cannot find module './routeTree.gen' or its corresponding type declarations
```

**Cause**: Route tree not generated yet

**Solution**:

1. Wait a few seconds after creating route files
2. Check if file exists:
   ```bash
   ls src/routeTree.gen.ts
   ```
3. If missing, follow "Route tree not generating" solution above
4. If exists but still error:
   ```bash
   # Restart TypeScript server in VS Code
   Cmd+Shift+P → "TypeScript: Restart TS Server"
   ```

**Reference**: `instructions.md` Step 8

---

## Issue: "router is not assignable to type"

**Symptom**: Type error when creating router

**Cause**: Missing module augmentation or wrong import

**Solution**:

1. Ensure module augmentation in `src/App.tsx`:

   ```typescript
   declare module "@tanstack/react-router" {
     interface Register {
       router: typeof router;
     }
   }
   ```

2. Check import order:

   ```typescript
   // Must import routeTree AFTER it's generated
   import { routeTree } from "./routeTree.gen";
   const router = createRouter({ routeTree });
   ```

3. Verify TanStack Router version:

   ```bash
   npm list @tanstack/react-router
   ```

4. If version mismatch:
   ```bash
   npm install @tanstack/react-router@latest
   npm install -D @tanstack/router-vite-plugin@latest
   ```

**Reference**: `instructions.md` Step 7

---

## Issue: Dashboard not protected (no redirect)

**Symptom**: Can access /dashboard when logged out

**Cause**: Auth check not working or redirect logic wrong

**Solution**:

1. Verify auth check in `dashboard.tsx`:

   ```typescript
   const user = useAuthStore((state) => state.user);

   useEffect(() => {
     if (!user) {
       navigate({ to: "/login" });
     }
   }, [user, navigate]);
   ```

2. Check auth state is initialized:

   ```typescript
   // In browser console on /dashboard
   useAuthStore.getState().user; // Should be null when logged out
   ```

3. Ensure `AuthProvider` wraps entire app in `main.tsx`:

   ```typescript
   <AuthProvider>
     <App />
   </AuthProvider>
   ```

4. Test auth persistence:
   ```bash
   # Clear browser storage and retry
   localStorage.clear()
   location.reload()
   ```

**Reference**: `instructions.md` Step 6

---

## Issue: Infinite redirect loop

**Symptom**: Page keeps redirecting between /login and /dashboard

**Cause**: Conflicting auth checks or auth state flapping

**Solution**:

1. Check for double auth checks:

   ```typescript
   // ❌ BAD: Both login and dashboard redirect to each other
   // login.tsx
   if (user) navigate({ to: "/dashboard" });

   // dashboard.tsx
   if (!user) navigate({ to: "/login" });
   ```

2. Add loading state to prevent premature redirects:

   ```typescript
   const initialized = useAuthStore((state) => state.initialized);

   if (!initialized) {
     return <div>Loading...</div>;
   }
   ```

3. Use dependency arrays correctly:
   ```typescript
   useEffect(() => {
     if (!user) {
       navigate({ to: "/login" });
     }
   }, [user, navigate]); // Include all dependencies
   ```

**Reference**: `instructions.md` Steps 4, 5, 6

---

## Issue: Links not working (full page reload)

**Symptom**: Clicking Link causes full page reload

**Cause**: Using `<a>` instead of `<Link>`

**Solution**:

1. Replace all `<a href>` with `<Link to>`:

   ```typescript
   // ❌ Wrong
   <a href="/dashboard">Dashboard</a>

   // ✅ Correct
   import { Link } from "@tanstack/react-router";
   <Link to="/dashboard">Dashboard</Link>
   ```

2. For external links, use regular `<a>`:

   ```typescript
   <a href="https://external.com" target="_blank">External</a>
   ```

3. For programmatic navigation:

   ```typescript
   import { useNavigate } from "@tanstack/react-router";

   const navigate = useNavigate();
   navigate({ to: "/dashboard" });
   ```

**Reference**: `instructions.md` Steps 3-6

---

## Issue: Route devtools not appearing

**Symptom**: Can't see TanStack Router icon in bottom-left

**Cause**: Not in dev mode or devtools not imported

**Solution**:

1. Verify you're in development:

   ```bash
   npm run dev  # Not npm run preview
   ```

2. Check import in `__root.tsx`:

   ```typescript
   import { TanStackRouterDevtools } from "@tanstack/router-devtools";

   export const Route = createRootRoute({
     component: () => (
       <>
         <Outlet />
         {import.meta.env.DEV && <TanStackRouterDevtools />}
       </>
     ),
   });
   ```

3. Install devtools if missing:

   ```bash
   npm install @tanstack/router-devtools
   ```

4. Check browser zoom (devtools might be off-screen)

**Reference**: `instructions.md` Steps 2 & 9

---

## Issue: "createFileRoute is not a function"

**Symptom**: Error when importing `createFileRoute`

**Cause**: Wrong import or old version

**Solution**:

1. Verify correct import:

   ```typescript
   import { createFileRoute } from "@tanstack/react-router";

   export const Route = createFileRoute("/dashboard")({
     component: Dashboard,
   });
   ```

2. Check TanStack Router version:

   ```bash
   npm list @tanstack/react-router
   # Should be v1.0+ for createFileRoute
   ```

3. Update if needed:
   ```bash
   npm install @tanstack/react-router@latest
   ```

**Reference**: `instructions.md` Steps 3-6

---

## Issue: 404 on page refresh

**Symptom**: Refreshing /dashboard shows 404

**Cause**: Dev server not configured for SPA routing

**Solution**:

For Vite dev server (should work by default), but if issues:

1. Create `vite.config.ts` fallback:

   ```typescript
   export default defineConfig({
     // ... existing config
     server: {
       historyApiFallback: true,
     },
   });
   ```

2. For production (Cloudflare Pages):
   - Add `_redirects` file to `public/`:
     ```
     /* /index.html 200
     ```

**Note**: Production deployment covered in later chunks.

**Reference**: Deployment docs (Phase C)

---

## Issue: TypeScript autocomplete not working for routes

**Symptom**: No autocomplete when typing `to="/..."`

**Cause**: TypeScript not recognizing generated types

**Solution**:

1. Verify module augmentation in `App.tsx`:

   ```typescript
   declare module "@tanstack/react-router" {
     interface Register {
       router: typeof router;
     }
   }
   ```

2. Ensure route tree imported:

   ```typescript
   import { routeTree } from "./routeTree.gen";
   ```

3. Restart TypeScript server:
   - VS Code: Cmd+Shift+P → "TypeScript: Restart TS Server"

4. Check `routeTree.gen.ts` for errors:
   ```bash
   npx tsc src/routeTree.gen.ts --noEmit
   ```

**Reference**: `instructions.md` Step 7

---

## Issue: Styles not applying after routing

**Symptom**: Page looks broken after navigating

**Cause**: Tailwind classes not detected or CSS not loaded

**Solution**:

1. Verify `index.css` imported in `main.tsx`:

   ```typescript
   import "./index.css"; // Must be present
   ```

2. Check Tailwind config includes route files:

   ```javascript
   // tailwind.config.js
   content: [
     "./index.html",
     "./src/**/*.{js,ts,jsx,tsx}", // Includes routes/
   ],
   ```

3. Rebuild Tailwind:
   ```bash
   # Restart dev server
   npm run dev
   ```

**Reference**: Chunk 001 Step 3

---

## Issue: Browser back button not working

**Symptom**: Clicking back button doesn't navigate

**Cause**: History API not being used correctly

**Solution**:

TanStack Router handles this automatically. If broken:

1. Ensure using `<Link>` components, not `<a>` tags
2. Verify no `preventDefault()` on navigation
3. Check no manual `window.history` manipulation
4. Test in different browser (could be browser issue)

**Reference**: `instructions.md` Step 10

---

## Still Stuck?

1. **Check TanStack Router Docs**:
   - https://tanstack.com/router/latest/docs

2. **Verify File Structure**:

   ```bash
   find src/routes -type f
   # Should show all route files
   ```

3. **Check Generated Route Tree**:

   ```bash
   cat src/routeTree.gen.ts
   # Should have all your routes listed
   ```

4. **Compare with Example**:
   - https://github.com/TanStack/router/tree/main/examples

5. **Search Similar Issues**:
   - GitHub: https://github.com/TanStack/router/issues

---

## Prevention Tips

- ✅ Always use `<Link>` for internal navigation
- ✅ Name route files correctly (lowercase, no spaces)
- ✅ Let plugin generate route tree (don't edit)
- ✅ Include module augmentation for types
- ✅ Test routing after every route addition
- ✅ Use router devtools to debug

---

**Last Updated**: 2025-01-15
