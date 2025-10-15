# Performance Budget

## Overview

This document defines the performance targets and bundle size constraints for Household Hub. The application uses a progressive loading strategy to ensure fast initial load times while providing rich functionality on-demand.

## Bundle Size Targets

### Core Bundle (<200KB)

The core bundle includes essential functionality for transaction management and must load quickly on mobile networks.

```
Core Bundle Components:
├── React & React-DOM (45KB gzipped)
├── TanStack Router (12KB)
├── Zustand (3KB)
├── React Hook Form (25KB)
├── Essential shadcn/ui components (30KB)
├── Core transaction logic (40KB)
├── Basic styling (20KB)
└── Utilities & polyfills (25KB)
Total: ~200KB gzipped
```

### Lazy-Loaded Chunks

#### Charts Module (~100KB)

```javascript
const ChartsModule = lazy(() => import("./modules/charts"));
```

- Recharts library (80KB)
- Chart components (15KB)
- Data transformers (5KB)

#### Analytics Module (~50KB)

```javascript
const AnalyticsModule = lazy(() => import("./modules/analytics"));
```

- Analytics logic (20KB)
- Report generators (15KB)
- Export utilities (15KB)

#### Admin Module (~75KB)

```javascript
const AdminModule = lazy(() => import("./modules/admin"));
```

- User management (25KB)
- Settings panels (30KB)
- Backup management (20KB)

### Total Application Size

- Initial Load: <200KB
- Full Application: <500KB
- With all features: <600KB

## Performance Metrics

### Core Web Vitals Targets

#### Largest Contentful Paint (LCP)

- **Target**: <2.5s
- **Good**: <1.5s on 3G
- **Measurement**: Time to render main transaction list

#### First Input Delay (FID)

- **Target**: <100ms
- **Good**: <50ms
- **Measurement**: Time to respond to first interaction

#### Cumulative Layout Shift (CLS)

- **Target**: <0.1
- **Good**: <0.05
- **Measurement**: Visual stability during load

#### First Contentful Paint (FCP)

- **Target**: <1.8s
- **Good**: <1.5s on 3G
- **Measurement**: Time to first visible content

#### Time to Interactive (TTI)

- **Target**: <5s
- **Good**: <3.5s on 3G
- **Measurement**: Time until fully interactive

### Lighthouse Score Targets

- **Performance**: >90
- **Accessibility**: >95
- **Best Practices**: >95
- **SEO**: >95
- **PWA**: >95

## Implementation Strategy

### 1. Code Splitting Configuration

```javascript
// vite.config.ts
export default {
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-react": ["react", "react-dom"],
          "vendor-router": ["@tanstack/react-router"],
          "vendor-query": ["@tanstack/react-query"],
          "vendor-form": ["react-hook-form", "zod"],
          "vendor-ui": ["lucide-react"],
          charts: ["recharts"],
          offline: ["dexie", "dexie-react-hooks"],
        },
      },
    },
    chunkSizeWarningLimit: 200, // KB
  },
};
```

### 2. Route-Based Splitting

```typescript
// routes.tsx
const routes = [
  {
    path: "/",
    component: lazy(() => import("./pages/Dashboard")),
  },
  {
    path: "/transactions",
    component: lazy(() => import("./pages/Transactions")),
  },
  {
    path: "/analytics",
    component: lazy(() => import("./pages/Analytics")),
  },
  {
    path: "/settings",
    component: lazy(() => import("./pages/Settings")),
  },
];
```

### 3. Dynamic Imports

```typescript
// Load heavy components on demand
const loadCharts = async () => {
  const { ChartsModule } = await import("./modules/charts");
  return ChartsModule;
};

// Load only when needed
const loadExport = async () => {
  const { ExportModule } = await import("./modules/export");
  return ExportModule;
};
```

## Monitoring & Enforcement

### 1. Bundlesize Configuration

```json
// .bundlesizerc.json
{
  "files": [
    {
      "path": "./dist/assets/index-*.js",
      "maxSize": "200KB",
      "compression": "gzip"
    },
    {
      "path": "./dist/assets/vendor-react-*.js",
      "maxSize": "45KB",
      "compression": "gzip"
    },
    {
      "path": "./dist/assets/charts-*.js",
      "maxSize": "100KB",
      "compression": "gzip"
    },
    {
      "path": "./dist/**/*.js",
      "maxSize": "600KB",
      "compression": "gzip"
    }
  ]
}
```

### 2. Lighthouse CI Configuration

```javascript
// lighthouserc.js
module.exports = {
  ci: {
    collect: {
      staticDistDir: "./dist",
      numberOfRuns: 3,
      settings: {
        preset: "desktop",
        throttling: {
          cpuSlowdownMultiplier: 4,
          throughputKbps: 1638.4, // 3G
        },
      },
    },
    assert: {
      assertions: {
        "categories:performance": ["error", { minScore: 0.9 }],
        "categories:accessibility": ["error", { minScore: 0.95 }],
        "first-contentful-paint": ["error", { maxNumericValue: 1500 }],
        "largest-contentful-paint": ["error", { maxNumericValue: 2500 }],
        interactive: ["error", { maxNumericValue: 3500 }],
        "cumulative-layout-shift": ["error", { maxNumericValue: 0.1 }],
        "total-blocking-time": ["error", { maxNumericValue: 300 }],
      },
    },
    upload: {
      target: "temporary-public-storage",
    },
  },
};
```

### 3. GitHub Actions Integration

```yaml
# .github/workflows/performance.yml
name: Performance Budget Check

on: [push, pull_request]

jobs:
  performance:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Install dependencies
        run: pnpm install

      - name: Build application
        run: pnpm build

      - name: Check bundle sizes
        run: pnpm bundlesize

      - name: Run Lighthouse CI
        run: |
          npm install -g @lhci/cli
          lhci autorun

      - name: Upload artifacts
        uses: actions/upload-artifact@v3
        with:
          name: performance-reports
          path: .lighthouseci/
```

## Optimization Techniques

### 1. Tree Shaking

- Use ES6 modules for better tree shaking
- Avoid default exports where possible
- Mark packages as side-effect free

### 2. Compression

- Enable Brotli compression on Cloudflare
- Pre-compress static assets
- Use WebP images with fallbacks

### 3. Caching Strategy

```javascript
// Service Worker caching
const CACHE_NAME = "household-hub-v1";
const STATIC_ASSETS = ["/index.html", "/assets/index.css", "/assets/index.js"];

// Cache static assets
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)));
});
```

### 4. Resource Hints

```html
<!-- Preconnect to external domains -->
<link rel="preconnect" href="https://supabase.co" />
<link rel="dns-prefetch" href="https://supabase.co" />

<!-- Preload critical resources -->
<link rel="preload" href="/fonts/inter.woff2" as="font" crossorigin />
<link rel="preload" href="/assets/index.js" as="script" />
```

### 5. Image Optimization

- Use responsive images with srcset
- Lazy load below-the-fold images
- Optimize with WebP format
- Use CDN for image delivery

## Monitoring Tools

### Development

- **Bundle Analyzer**: `pnpm analyze`
- **Lighthouse**: Chrome DevTools
- **Coverage**: Chrome DevTools Coverage tab
- **Performance**: Chrome DevTools Performance tab

### Production

- **Cloudflare Analytics**: Built-in metrics
- **Sentry Performance**: Real user monitoring
- **Custom metrics**: Performance Observer API

## Performance Review Checklist

### Before Each Release

- [ ] Run bundle analyzer
- [ ] Check bundle sizes against budget
- [ ] Run Lighthouse audit
- [ ] Test on 3G network
- [ ] Verify lazy loading works
- [ ] Check for memory leaks
- [ ] Review network waterfall
- [ ] Test on low-end devices

### Weekly Monitoring

- [ ] Review Cloudflare analytics
- [ ] Check Sentry performance data
- [ ] Analyze user session replays
- [ ] Review bundle size trends
- [ ] Check Core Web Vitals

## Troubleshooting

### Common Issues and Solutions

#### Bundle Size Exceeded

1. Run `pnpm analyze` to identify large modules
2. Check for duplicate dependencies
3. Consider dynamic imports for large features
4. Review tree shaking effectiveness

#### Slow Initial Load

1. Verify code splitting is working
2. Check for render-blocking resources
3. Optimize critical rendering path
4. Enable resource compression

#### Poor Lighthouse Score

1. Address specific audit failures
2. Optimize images and fonts
3. Reduce JavaScript execution time
4. Minimize main thread work

## Future Optimizations

### Phase 2

- Module federation for micro-frontends
- Edge computing with Cloudflare Workers
- Predictive prefetching
- Differential loading for modern browsers

### Phase 3

- WebAssembly for compute-intensive tasks
- Service Worker optimizations
- Advanced caching strategies
- HTTP/3 and QUIC protocol

## References

- [Web.dev Performance](https://web.dev/performance/)
- [Chrome User Experience Report](https://developers.google.com/web/tools/chrome-user-experience-report)
- [Lighthouse Documentation](https://developers.google.com/web/tools/lighthouse)
- [Bundle Phobia](https://bundlephobia.com/)
