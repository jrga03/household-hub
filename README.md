# Household Hub

Offline-first PWA for household financial management, built with privacy and resilience in mind.

## Tech Stack

### Core

- **React 19** - UI library
- **TypeScript 5.9** - Type safety
- **Vite 7** - Build tool with SWC for fast compilation

### Routing & State

- **TanStack Router** - Type-safe routing
- **TanStack Query** - Server state management
- **TanStack Table** - Data tables
- **TanStack Virtual** - Virtualization for large lists
- **Zustand** - Client state management

### Offline & Data

- **Dexie** - IndexedDB wrapper for offline storage
- **Supabase** - Backend (PostgreSQL + Auth)
- **FingerprintJS** - Device identification

### UI & Styling

- **Tailwind CSS v4** - Utility-first CSS
- **shadcn/ui** - Component library
- **Lucide React** - Icons
- **Recharts** - Charts
- **Sonner** - Toast notifications

### Forms & Validation

- **React Hook Form** - Form management
- **Zod** - Schema validation

### Testing & Quality

- **Vitest** - Unit testing
- **Playwright** - E2E testing
- **Testing Library** - Component testing
- **ESLint** - Linting with best practices
- **Prettier** - Code formatting
- **Husky** - Git hooks

## Getting Started

### Prerequisites

- Node.js 20+ (see `.nvmrc`)
- npm/pnpm

### Installation

```bash
# Clone repository
git clone https://github.com/jrga03/household-hub.git
cd household-hub

# Install dependencies
npm install

# Start development server
npm run dev
```

## Available Scripts

```bash
npm run dev          # Start development server (port 3000)
npm run build        # Build for production
npm run preview      # Preview production build
npm run lint         # Run ESLint
npm run lint:fix     # Fix ESLint issues
npm run format       # Format code with Prettier
npm test             # Run unit tests (Vitest)
npm run test:unit    # Run unit tests explicitly
npm run test:e2e     # Run E2E tests (Playwright)
npm run test:e2e:ui  # Run E2E tests with UI
npm run test:all     # Run all tests (unit + E2E)
```

## Project Structure

```
household-hub/
├── .husky/              # Git hooks
│   ├── pre-commit       # Runs Prettier via lint-staged
│   └── pre-push         # Runs ESLint fix + tests
├── docs/                # Project documentation
│   └── initial plan/    # Architecture & planning docs
├── public/              # Static assets
├── src/
│   ├── components/      # React components
│   ├── lib/             # Utilities, Dexie DB
│   ├── stores/          # Zustand stores
│   ├── routes/          # TanStack Router pages
│   ├── hooks/           # Custom React hooks
│   ├── types/           # TypeScript types
│   ├── App.tsx          # Root component
│   ├── main.tsx         # Entry point
│   └── index.css        # Global styles + Tailwind
├── eslint.config.js     # ESLint configuration (flat config)
├── vite.config.ts       # Vite + plugins configuration
├── tsconfig.json        # TypeScript configuration
├── .prettierrc          # Prettier configuration
└── package.json         # Dependencies & scripts
```

## Git Hooks

### Pre-commit

- Runs **Prettier** on staged files via `lint-staged`
- Formats TypeScript, JavaScript, JSON, Markdown, and YAML files

### Pre-push

- Runs **ESLint** with `--fix` to catch and auto-fix issues
- Runs **unit tests** to ensure code quality

## Configuration Highlights

### TypeScript

- Strict mode enabled
- Path aliases: `@/*` → `./src/*`
- Target: ES2022

### Vite

- SWC plugin for fast compilation
- TanStack Router Vite plugin
- Tailwind CSS v4 Vite plugin
- Port: 3000

### Tailwind CSS

- Version 4 (no PostCSS or Autoprefixer needed)
- shadcn/ui design tokens configured
- Dark mode support via `.dark` class

### ESLint

- Best practices from TypeScript, React, and React Hooks
- Pragmatic rules:
  - `no-unused-vars`: warn
  - `no-explicit-any`: error (proper typing enforced)
  - `exhaustive-deps`: best practice for preventing memory leaks

## Architecture

See `docs/initial plan/` for detailed architecture documentation:

- **ARCHITECTURE-SUMMARY.md** - High-level overview
- **QUICK-START.md** - Getting started guide
- **IMPLEMENTATION-PLAN.md** - 15-day development plan
- **DATABASE.md** - Schema design
- **SYNC-ENGINE.md** - Offline-first sync architecture

## Core Principles

1. **Offline-First**: Everything works offline, sync when possible
2. **Event Sourced**: Never lose data, complete audit trail
3. **Privacy-Focused**: Private household app, no external tracking
4. **Free Tier Optimized**: Stay within Supabase/Cloudflare free limits
5. **Progressive Enhancement**: Core features work everywhere

## Next Steps

1. Review architecture docs in `docs/initial plan/`
2. Set up Supabase project (see `DATABASE.md`)
3. Configure environment variables (`.env.local`)
4. Start Day 2 implementation (Backend Setup)

## License

Private project - All rights reserved
