# Chunk 039: Backup Encryption

## At a Glance

- **Time**: 2 hours
- **Milestone**: Multi-Device Sync (Backups - security)
- **Prerequisites**: Chunk 038 (R2 setup working), WebCrypto API available
- **Can Skip**: No - required before storing backups in cloud

## What You're Building

Client-side encryption system for backups before cloud storage:

- WebCrypto API with AES-GCM 256-bit encryption
- PBKDF2 key derivation from Supabase auth tokens
- Auth-derived keys (automatic, no user passphrase needed)
- IV (Initialization Vector) generation and storage
- Encryption/decryption utilities
- Unit tests for crypto operations
- Error handling for crypto failures

## Why This Matters

Encryption is **critical for financial data security**:

- **Privacy**: Financial data never stored unencrypted in cloud
- **Trust**: Users control their own encryption
- **Compliance**: Meets data protection requirements
- **Security**: Even if R2 compromised, data is useless
- **Zero-knowledge**: Cloudflare cannot read backup content

Per Decision #83, encryption must be implemented BEFORE automated cloud backups.

## Before You Start

Make sure you have:

- Chunk 038 completed (R2 Worker deployed)
- Basic understanding of cryptography concepts
- Supabase Auth working (for key derivation)
- Modern browser with WebCrypto API

## What Happens Next

After this chunk:

- Backup data encrypted client-side
- Keys derived from auth tokens automatically
- IV stored with encrypted data
- Ready for backup orchestration (chunk 040)

## Key Files Created

```
src/
├── lib/
│   ├── backup-encryption.ts       # Encryption engine
│   ├── backup-encryption.test.ts  # Crypto tests
│   └── crypto-utils.ts            # Helper utilities
└── types/
    └── backup.ts                  # Backup-related types
```

## Features Included

### Key Derivation

- PBKDF2 with 100,000 iterations
- SHA-256 hash algorithm
- Deterministic salt from user ID
- Derived from Supabase JWT + user ID

### Encryption

- AES-GCM 256-bit (industry standard)
- Random IV per encryption (12 bytes)
- Additional authenticated data (AAD)
- Integrity verification via GCM tag

### Decryption

- IV extraction from encrypted payload
- Key re-derivation from current session
- Integrity verification
- Error handling for corrupted data

### Storage Format

```typescript
{
  encrypted: Uint8Array,      // Encrypted data
  iv: Uint8Array,              // Initialization vector
  algorithm: 'AES-GCM',        // Algorithm identifier
  keyDerivation: 'auth-derived-pbkdf2'  // Key source
}
```

## Related Documentation

- **Original**: `docs/initial plan/R2-BACKUP.md` lines 620-710 (encryption spec)
- **Original**: `docs/initial plan/SECURITY.md` (if exists)
- **Decisions**:
  - #83: Phase B encryption before cloud backups
  - #84: PII scrubbing and data protection
- **External**: [WebCrypto API Docs](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API)

## Technical Stack

- **WebCrypto API**: Browser-native cryptography
- **AES-GCM**: Authenticated encryption mode
- **PBKDF2**: Password-based key derivation
- **TypeScript**: Type-safe crypto operations
- **Vitest**: Unit tests for encryption

## Design Patterns

### Auth-Derived Key Pattern

```typescript
// Derive encryption key from current session
// No user passphrase needed, automatic
const key = await deriveKeyFromAuth();

// Encrypt with derived key
const encrypted = await encrypt(data, key);

// Later, with same auth session:
const key2 = await deriveKeyFromAuth(); // Same key!
const decrypted = await decrypt(encrypted, key2);
```

Benefits:

- No passphrase to remember
- Automatic key generation
- Keys tied to user session
- Deterministic (same key from same session)

### Encryption Format Pattern

```
[IV (12 bytes)][Encrypted Data][GCM Tag (16 bytes)]
```

Everything stored together for easy transport.

### Fallback Strategy Pattern

```typescript
try {
  // Try auth-derived key
  const key = await deriveKeyFromAuth();
  return await decrypt(data, key);
} catch (error) {
  // Future: Try user passphrase if set
  if (hasUserPassphrase()) {
    const key = await deriveKeyFromPassphrase(passphrase);
    return await decrypt(data, key);
  }
  throw error;
}
```

## Security Considerations

### Key Derivation

- **PBKDF2 iterations**: 100,000 (OWASP recommended)
- **Salt**: Derived from user ID (deterministic but unique per user)
- **Key material**: JWT + user ID (64+ bytes entropy)
- **Algorithm**: SHA-256 (collision-resistant)

### Encryption

- **Algorithm**: AES-GCM (authenticated, prevents tampering)
- **Key size**: 256 bits (military-grade)
- **IV**: Random 12 bytes per encryption (never reuse)
- **Tag size**: 128 bits (default GCM, strong integrity)

### Key Storage

- **Never stored permanently**: Re-derived each time
- **In-memory only**: Key exists during operation only
- **Session-bound**: New session = new derivation

### Attack Resistance

- **Brute force**: 2^256 key space (infeasible)
- **Rainbow tables**: Salt prevents precomputation
- **Tampering**: GCM tag detects modifications
- **Replay**: IV prevents replay attacks

## Encryption vs Compression

Encrypt AFTER compression:

```
Data → Compress → Encrypt → Upload

Download → Decrypt → Decompress → Data
```

Why? Encrypted data has high entropy (not compressible).

## Performance Characteristics

- **Key derivation**: ~200ms (100k iterations)
- **Encryption**: ~10ms per MB
- **Decryption**: ~10ms per MB
- **Memory**: ~2x data size during operation

For 5MB backup:

- Derive key: 200ms
- Encrypt: 50ms
- **Total**: ~250ms

## Browser Compatibility

WebCrypto API supported in:

- Chrome 37+
- Firefox 34+
- Safari 11+
- Edge 12+

**iOS Safari**: Full support (no fallback needed)

## Error Handling

### Key Derivation Failures

- No active session → Prompt login
- Invalid token → Refresh session
- Crypto not available → Show error (rare)

### Encryption Failures

- Data too large → Chunk data first
- Out of memory → Reduce batch size
- Crypto error → Log and retry

### Decryption Failures

- Wrong key → Try fallback keys
- Corrupted data → Checksum failed, restore from backup
- Invalid IV → Data corrupted, abort

## Testing Strategy

### Unit Tests

- Key derivation determinism
- Encryption/decryption round-trip
- IV uniqueness
- Error handling (bad key, corrupted data)
- Edge cases (empty data, large data)

### Integration Tests

- Full backup encryption flow
- Session refresh during operation
- Concurrent encryptions
- Memory leak detection

### Security Tests

- IV never reused
- Key never logged
- Data zeroed after use
- Timing attack resistance (future)

## Future Enhancements (Phase C)

### Optional User Passphrase

- Additional encryption layer
- User-chosen passphrase
- Stored encrypted with auth-derived key
- "Super key" concept

### Key Recovery

- Encrypted key backup
- Recovery codes
- Multi-factor key derivation
- Key escrow (optional)

### Hardware Security

- WebAuthn integration
- Secure Enclave (iOS/macOS)
- TPM support (Windows)
- Yubikey support

---

**Ready?** → Open `instructions.md` to begin
