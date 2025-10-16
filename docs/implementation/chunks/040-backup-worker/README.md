# Chunk 040: Backup Worker

## At a Glance

- **Time**: 1.5 hours
- **Milestone**: Multi-Device Sync (Final backup piece)
- **Prerequisites**: Chunks 037-039 completed
- **Can Skip**: No - completes the backup system

## What You're Building

Complete backup orchestration system:

- BackupManager class (gather, compress, encrypt, upload)
- RestoreManager class (download, verify, decrypt, decompress)
- Progress tracking with callbacks
- Checksum generation (SHA-256)
- Retry logic with exponential backoff
- Backup history UI
- Manual backup trigger button
- Restore workflow UI

## Why This Matters

Orchestration **ties everything together**:

- **Data gathering**: Collect all data from IndexedDB
- **Compression**: Reduce backup size by 70-90%
- **Encryption**: Secure data before upload
- **Upload**: Push to R2 via Worker
- **Restore**: Reverse process with validation

This completes the Phase B backup system per Decision #83.

## Key Files Created

```
src/
├── lib/
│   ├── backup-manager.ts       # Backup orchestration
│   ├── restore-manager.ts      # Restore orchestration
│   └── backup-manager.test.ts  # Unit tests
├── components/
│   ├── BackupButton.tsx        # Manual backup trigger
│   └── BackupHistory.tsx       # Backup list UI
└── routes/
    ├── backups.tsx             # Backup management page
    └── restore.tsx             # Restore workflow page
```

## Features Included

### Backup Flow

1. Gather data from IndexedDB
2. Create snapshot with metadata
3. Compress with gzip
4. Encrypt with AES-GCM
5. Generate checksum
6. Get signed URL from Worker
7. Upload to R2
8. Record metadata in Supabase

### Restore Flow

1. List available backups
2. Get signed download URL
3. Download from R2
4. Verify checksum
5. Decrypt with key
6. Decompress
7. Validate schema version
8. Restore to IndexedDB
9. Trigger sync

### Progress Tracking

- Data gathering: 10%
- Compression: 20%
- Encryption: 30%
- Upload: 70% (largest step)
- Metadata: 100%

### Error Recovery

- Retry failed uploads (3 attempts)
- Exponential backoff (1s, 2s, 4s)
- Partial upload recovery
- Rollback on failure

## Related Documentation

- **Original**: `docs/initial plan/R2-BACKUP.md` lines 292-598 (backup manager)
- **Original**: `docs/initial plan/IMPLEMENTATION-PLAN.md` lines 410-441 (backup completion)

## Performance Characteristics

For typical 5MB backup:

- Gather data: 500ms
- Compress: 200ms
- Encrypt: 250ms
- Upload: 2-5s (network dependent)
- **Total**: 3-6s

## Design Patterns

### Pipeline Pattern

```
Data → Compress → Encrypt → Upload
     ↓            ↓          ↓
   Progress    Progress  Progress
```

### Retry Pattern

```typescript
async function withRetry(fn: () => Promise<T>, retries = 3): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === retries - 1) throw error;
      await sleep(Math.pow(2, i) * 1000);
    }
  }
}
```

---

**Ready?** → Open `instructions.md` to begin
