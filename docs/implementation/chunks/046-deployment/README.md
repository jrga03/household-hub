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

Make sure you have:

- All chunks 001-045 completed
- All tests passing
- Cloudflare account
- Sentry account (optional but recommended)
- Custom domain (optional)

## What Happens Next

After this chunk:

- **App live at**: `https://household-hub.pages.dev`
- **Monitoring active**: Sentry tracking errors
- **Auto-deploy**: Push to main = deploy
- **Production ready**: Users can access app

🎉 **Congratulations! Your app is LIVE!**

## Related Documentation

- **Original**: `docs/initial plan/IMPLEMENTATION-PLAN.md` lines 533-565
- **Decision**: #84 (PII scrubbing in Sentry)
- **External**: [Cloudflare Pages](https://pages.cloudflare.com/)
- **External**: [Sentry Docs](https://docs.sentry.io/)

## Key Files Created

```
.github/workflows/
└── deploy.yml                # CI/CD pipeline
.lighthouserc.json            # Lighthouse CI config
wrangler.toml                 # Cloudflare config
sentry.client.config.ts       # Sentry setup
```

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
