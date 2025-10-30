# Chunk 046: Deployment

## At a Glance

- **Time**: 1.5 hours
- **Milestone**: Production (6 of 6 - FINAL!)
- **Prerequisites**: All previous chunks (001-045)
- **Can Skip**: No - this is the deployment to production

## What You're Building

Production deployment to Cloudflare Pages with monitoring:

- Cloudflare Pages deployment
- Environment variables configuration
- Custom domain setup
- Sentry error tracking with PII scrubbing
- Lighthouse CI verification
- Production checklist
- Rollback procedure

## Why This Matters

Deployment makes your app **live and accessible**:

- **Cloudflare Pages**: Free, fast global CDN
- **Automatic SSL**: HTTPS by default
- **Git integration**: Deploy on push
- **Preview deployments**: Test before production
- **Error tracking**: Sentry catches production bugs
- **Performance monitoring**: Lighthouse CI on every deploy

Per Day 15 implementation plan, this completes the production deployment.

## Before You Start

### Required Prerequisites

**Critical chunks must be complete**:

- **Chunk 002** (auth-flow) - Authentication system working
- **Chunk 020** (dexie-setup) - IndexedDB configured for offline
- **Chunk 041** (pwa-manifest) - PWA manifest for installation
- **Chunk 042** (service-worker) - Service worker for offline functionality
- **Chunk 045** (e2e-tests) - All E2E tests passing

**System requirements**:

- [ ] All tests passing (`npm test && npm run test:e2e`)
- [ ] Build succeeds (`npm run build`)
- [ ] No TypeScript errors (`npx tsc --noEmit`)
- [ ] Database migrations applied to production Supabase project
- [ ] Environment variables ready (Supabase URL, anon key)

**Accounts needed**:

- [ ] Cloudflare account (free tier)
- [ ] Sentry account (optional but recommended, 5K errors/month free)
- [ ] Custom domain (optional, can use `*.pages.dev`)

## What Happens Next

After this chunk:

- **App live at**: `https://household-hub.pages.dev`
- **Monitoring active**: Sentry tracking errors
- **Auto-deploy**: Push to main = deploy
- **Production ready**: Users can access app

🎉 **Congratulations! Your app is LIVE!**

## Related Documentation

- **Original**: `docs/initial plan/IMPLEMENTATION-PLAN.md` lines 533-565
- **Decision**: #87 (Sentry PII scrubbing for financial data)
- **External**: [Cloudflare Pages](https://pages.cloudflare.com/)
- **External**: [Sentry Docs](https://docs.sentry.io/)

## Key Files Created

```
.github/workflows/
└── deploy.yml                # CI/CD pipeline
.lighthouserc.json            # Lighthouse CI config
src/lib/sentry.ts             # Sentry setup with PII scrubbing
DEPLOYMENT.md                 # Deployment quick reference
```

**Note**: Cloudflare **Pages** is configured via dashboard, not `wrangler.toml`. If you need Cloudflare Workers for R2 proxy (chunk 040) or push notifications (chunk 043), those would use separate `wrangler.toml` files in their respective worker directories.

## Deployment Checklist

### Pre-Deployment ✓

- [ ] All tests passing (`npm test && npm run test:e2e`)
- [ ] Build succeeds (`npm run build`)
- [ ] No console errors in production build
- [ ] Environment variables documented
- [ ] Database migrations applied
- [ ] RLS policies tested

### Post-Deployment ✓

- [ ] Site loads at production URL
- [ ] HTTPS working
- [ ] PWA installs correctly
- [ ] Service worker registers
- [ ] Monitoring active (Sentry)
- [ ] Lighthouse scores meet targets
- [ ] Custom domain configured (if applicable)

---

**Ready?** → Open `instructions.md` to begin
