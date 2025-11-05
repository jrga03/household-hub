# GitHub Configuration (`/.github/`)

## Purpose

The `.github` directory contains **GitHub-specific configuration** including CI/CD workflows, issue templates, and repository settings.

## Contents

- **`workflows/`** - GitHub Actions CI/CD workflows

## GitHub Actions Workflows

**Location:** `.github/workflows/`

**Current Workflows:**

- Test and deployment workflows (to be configured)

### Typical CI/CD Pipeline

**On Pull Request:**

1. Install dependencies (`npm ci`)
2. Run linter (`npm run lint`)
3. Run type check (`tsc --noEmit`)
4. Run unit tests (`npm test`)
5. Build application (`npm run build`)

**On Push to Main:**

1. All PR checks
2. Run E2E tests (`npm run test:e2e`)
3. Deploy to production (Cloudflare Pages)

### Setting Up CI/CD

**Example workflow (`.github/workflows/ci.yml`):**

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 18
          cache: "npm"

      - run: npm ci
      - run: npm run lint
      - run: npm test
      - run: npm run build
```

## Required Secrets

**GitHub Repository Secrets:**

**Supabase:**

- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_ANON_KEY` - Public anon key
- `SUPABASE_SERVICE_ROLE_KEY` - Admin key (for deployments)
- `SUPABASE_ACCESS_TOKEN` - CLI access token

**Cloudflare:**

- `CLOUDFLARE_API_TOKEN` - Cloudflare API token
- `CLOUDFLARE_ACCOUNT_ID` - Account ID

**Sentry:**

- `SENTRY_AUTH_TOKEN` - Sentry upload token
- `SENTRY_ORG` - Sentry organization
- `SENTRY_PROJECT` - Sentry project name

## Future Enhancements

**Issue Templates:**

- Bug report template
- Feature request template
- Documentation improvement template

**Pull Request Template:**

- Checklist for PRs
- Testing instructions
- Documentation requirements

**Dependabot:**

- Automated dependency updates
- Security vulnerability alerts

## Related Documentation

### Comprehensive Guides

- [/docs/initial plan/DEPLOYMENT.md](../docs/initial%20plan/DEPLOYMENT.md) - Deployment strategy

### Project Documentation

- [/CLAUDE.md](../CLAUDE.md) - Project quick reference

## Further Reading

- [GitHub Actions](https://docs.github.com/en/actions) - CI/CD documentation
- [Workflow Syntax](https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions) - YAML reference
