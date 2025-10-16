# Chunk 018: Transfers UI

## At a Glance

- **Time**: 1 hour
- **Milestone**: MVP (Optional)
- **Prerequisites**: Chunk 017 (transfers schema), Chunk 005 (accounts UI)
- **Can Skip**: Yes - transfers are optional

## What You're Building

Transfer creation and management interface:

- Transfer form (from account → to account)
- Paired transaction creation (atomic operation)
- Transfer list view with account pairs
- Transfer deletion handling (unpair UI)
- Visual indicators for transfers vs regular transactions

## Why This Matters

Transfers are different from regular transactions - they represent money movement between accounts. The UI must:

- Create both transactions atomically
- Show the connection between paired transactions
- Handle deletion gracefully (convert to regular transactions)

## Key Files Created

```
src/
├── components/
│   └── transfers/
│       ├── TransferForm.tsx        # Create transfer
│       ├── TransferList.tsx        # Show transfers
│       └── TransferBadge.tsx       # Visual indicator
├── routes/
│   └── transfers.tsx               # Transfers page
└── hooks/
    └── useTransfers.ts             # Transfer queries
```

## Features

- Account-to-account transfer creation
- Paired transaction display
- Transfer filtering
- Unpair on delete (converts to regular transaction)

## Related Documentation

- **Original**: `docs/initial plan/DATABASE.md` lines 441-543
- **Decisions**: #60 (transfer design)

---

**Ready?** → Open `instructions.md` to begin
