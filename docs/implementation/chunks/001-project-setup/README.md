# Chunk 001: Project Setup

## At a Glance

- **Time**: 45 minutes
- **Milestone**: Foundation (1 of 3)
- **Prerequisites**: None (first chunk!)
- **Can Skip**: No - everything depends on this

## What You're Building

A fresh Vite + React + TypeScript project with:

- Development server
- Core dependencies (Router, Query, Zustand, shadcn/ui)
- ESLint + Prettier configured
- Git repository initialized
- Folder structure ready

## Why This Matters

This is the foundation for everything else. Get this right and the rest flows smoothly. Get it wrong and you'll hit dependency conflicts later.

## Before You Start

Make sure you have:

- Node.js 20+ LTS installed
- npm or pnpm
- Git
- A code editor (VS Code recommended)

Check versions:

```bash
node --version  # Should be v20+
npm --version   # Should be v10+
```

## What Happens Next

After this chunk:

- `npm run dev` will start a dev server
- You'll have a "Hello World" React app
- TypeScript will compile without errors
- You can proceed to chunk 002 (Auth)

## Key Files Created

```
household-hub/
├── src/
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
├── package.json
├── vite.config.ts
├── tsconfig.json
├── .gitignore
└── .env.example
```

## Related Documentation

- **Original**: `docs/initial plan/IMPLEMENTATION-PLAN.md` Day 1 Morning
- **Decisions**: Vite (#3), React 19 (#1), TypeScript strict mode
- **Architecture**: `docs/initial plan/ARCHITECTURE.md` Tech Stack section

---

**Ready?** → Open `instructions.md` to begin
