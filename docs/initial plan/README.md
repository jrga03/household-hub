# Household Hub

A comprehensive household management Progressive Web App built with React, TypeScript, and Supabase. Features offline-first financial tracking, document management, and household organization tools.

## 🎯 Vision

A single dashboard to handle all household-related tasks:

- **Financial Tracking** - Joint and personal expense management with budget tracking
- **Insurance Repository** - Secure document storage and policy tracking
- **Important Documents** - Quick access links and references
- **Home Maintenance** - Scheduled tasks and maintenance logs
- **Inventory Management** - Household items and supplies tracking

## 🚀 Quick Start

```bash
# Clone repository
git clone <repository-url>
cd household-hub

# Install dependencies
npm install

# Setup environment
cp .env.example .env.local
# Add Supabase URL and anon key to .env.local

# Initialize database
npx supabase init
npx supabase db push

# Run development server
npm run dev

# Run data migration (one-time)
npm run migrate -- --file=./data/Savings_Expenses.csv
```

## 📦 Tech Stack

- **Frontend**: React 18.3 + TypeScript 5.6 + Vite 5.4
- **Styling**: Tailwind CSS 3.4 + shadcn/ui
- **State**: Zustand + TanStack Query + Dexie.js (IndexedDB)
- **Backend**: Supabase (PostgreSQL + Auth + Realtime)
- **Deployment**: Cloudflare Pages + Cloudflare R2
- **PWA**: Vite PWA with offline support and push notifications

## 📁 Project Structure

```
household-hub/
├── apps/web/           # Main web application
├── supabase/          # Database and edge functions
├── scripts/           # Migration and utility scripts
└── docs/              # Documentation
```

## 🏗️ Core Features

### Financial Tracker (Phase 1)

- ✅ Joint and personal expense tracking
- ✅ Multi-user with transaction tagging
- ✅ Budget target tracking with variance alerts
- ✅ Multiple bank account management
- ✅ Offline-first with sync
- ✅ 5-minute auto-snapshots during editing
- ✅ Excel/CSV import and export

### Document Management (Phase 2)

- 📋 Insurance policy repository
- 📎 Google Drive link references
- 🔍 Quick access dashboard

### Extended Features (Phase 3)

- 🏠 Home maintenance scheduler
- 📦 Inventory management
- 📊 Advanced analytics and reporting

## 👥 Multi-User Support

- **Joint Accounts**: Shared household expenses
- **Personal Accounts**: Individual expense tracking
- **User Tagging**: @mention users in transactions
- **Push Notifications**: Budget alerts, due dates, mentions

## 🔄 Offline Support

- **IndexedDB**: Local data persistence
- **Event Sourcing**: Conflict-free sync
- **Background Sync**: Automatic when online
- **PWA**: Installable with offline access

## 📚 Documentation

- [Architecture Overview](./ARCHITECTURE.md)
- [Database Schema](./DATABASE.md)
- [Feature Specifications](./FEATURES.md)
- [Implementation Plan](./IMPLEMENTATION-PLAN.md)
- [Sync Engine](./SYNC-ENGINE.md)
- [Migration Guide](./MIGRATION.md)
- [Deployment Guide](./DEPLOYMENT.md)
- [Design Decisions](./DECISIONS.md)

## 🤝 Contributing

This is a personal household management system. Contributions are welcome for bug fixes and feature improvements.

## 📄 License

Private project - All rights reserved

## 🙏 Acknowledgments

- Migrated from complex Google Sheets system
- Built with modern web technologies
- Designed for long-term maintainability
