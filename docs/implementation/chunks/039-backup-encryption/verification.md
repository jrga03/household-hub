# Verification: Backup Encryption

Quick verification checklist after completing chunk 039. Use this to confirm the encryption system is production-ready before proceeding to chunk 040.

---

## Prerequisites Verified (Before Implementation)

Confirm these were checked in Step 0:

- [ ] Chunk 038 complete (R2 Worker deployed and accessible)
- [ ] WebCrypto API available in browser (all 6 API checks pass)
- [ ] Supabase Auth working (can retrieve valid session)
- [ ] Test environment supports crypto operations (basic tests pass)

---

## Core Implementation Complete

### Files Created

- [ ] `src/types/backup.ts` - Backup type definitions
- [ ] `src/lib/crypto-utils.ts` - Crypto utility functions
- [ ] `src/lib/backup-encryption.ts` - Main encryption engine
- [ ] `src/lib/backup-encryption.test.ts` - Unit tests
- [ ] `src/hooks/useBackupEncryption.ts` - React hook
- [ ] `src/hooks/useBackupEncryption.test.ts` - Hook tests
- [ ] `src/lib/__tests__/backup-encryption-integration.test.ts` - Integration tests
- [ ] `src/lib/__tests__/backup-encryption-performance.test.ts` - Performance tests
- [ ] `src/lib/__tests__/backup-encryption-browser.test.ts` - Browser compatibility
- [ ] `src/lib/encryption-errors.ts` - Custom error classes

---

## Test Suite Passing

### Unit Tests (15+)

```bash
npm test src/lib/backup-encryption.test.ts
```

- [ ] All unit tests pass
- [ ] Coverage: Encryption/decryption round-trip
- [ ] Coverage: IV uniqueness (100 iterations)
- [ ] Coverage: Data corruption detection
- [ ] Coverage: Empty data handling
- [ ] Coverage: Large data handling (5MB)
- [ ] Coverage: Pack/unpack integrity
- [ ] Coverage: Rapid successive encryptions
- [ ] Coverage: Session validation
- [ ] Coverage: Key clearing
- [ ] Coverage: JSON structure handling
- [ ] Coverage: Binary data handling

**Test Duration**: <10 seconds

---

### Integration Tests (5+)

```bash
npm test backup-encryption-integration
```

- [ ] All integration tests pass
- [ ] Full backup encryption flow (10 steps)
- [ ] Key consistency across multiple operations
- [ ] Graceful handling of corrupted data
- [ ] Session expiry scenario
- [ ] Different ciphertext for same plaintext

**Test Duration**: <15 seconds

---

### Performance Tests (6+)

```bash
npm test backup-encryption-performance
```

- [ ] All performance benchmarks pass
- [ ] 1MB encryption: <500ms ✓
- [ ] 1MB decryption: <500ms ✓
- [ ] 10MB round-trip: <2000ms ✓
- [ ] Key derivation (PBKDF2 100k iterations): <300ms ✓
- [ ] 100 rapid encryptions: <20ms average ✓
- [ ] Performance scales linearly with data size ✓

**Note**: Performance may vary on slower machines. If tests fail, verify expectations in `troubleshooting.md`.

---

### Browser Compatibility Tests (5+)

```bash
npm test backup-encryption-browser
```

- [ ] All compatibility tests pass
- [ ] WebCrypto API availability verified
- [ ] AES-GCM algorithm supported
- [ ] PBKDF2 algorithm supported
- [ ] TextEncoder/TextDecoder work with emojis
- [ ] Large Uint8Array allocations succeed (1MB, 5MB, 10MB)

---

### Hook Tests (4+)

```bash
npm test useBackupEncryption.test.ts
```

- [ ] All hook tests pass
- [ ] Encrypt and decrypt data
- [ ] Loading states correct
- [ ] WebCrypto support detection
- [ ] Key clearing works

---

## Security Verification

### Key Material Protection

```javascript
// In browser console after implementation:
import { BackupEncryption } from "@/lib/backup-encryption";

const encryption = new BackupEncryption();
await encryption.deriveKeyFromAuth();

// Try to log the encryption instance
console.log("Encryption instance:", encryption);

// Inspect encryptionKey property
console.log("Key visible?", encryption.encryptionKey);
```

- [ ] `encryptionKey` is `CryptoKey` object (not raw bytes)
- [ ] No key material visible in console output
- [ ] CryptoKey objects are non-extractable

---

### IV Uniqueness Guarantee

```javascript
// In browser console:
const data = new TextEncoder().encode("Same data");
const iterations = 100;
const ivs = new Set();

for (let i = 0; i < iterations; i++) {
  const encrypted = await encryption.encryptBackup(data);
  ivs.add(encrypted.iv.join(","));
}

console.log(`Generated ${iterations} encryptions`);
console.log(`Unique IVs: ${ivs.size}`);
console.log("✓ All IVs unique:", ivs.size === iterations);
```

- [ ] All 100 IVs are unique (100/100)
- [ ] IV length is always 12 bytes
- [ ] Random generation works correctly

---

### Session Validation

```javascript
// Test that encryption requires active session:

// 1. Log out user
await supabase.auth.signOut();

// 2. Clear encryption key
encryption.clearKey();

// 3. Try to encrypt
try {
  const data = new TextEncoder().encode("Test");
  await encryption.encryptBackup(data);
  console.log("✗ ERROR: Should have required login");
} catch (error) {
  console.log("✓ Correctly requires session:", error.message);
}
```

- [ ] Encryption fails when logged out
- [ ] Clear error message: "No active session"
- [ ] After login, encryption works correctly

---

### Data Corruption Detection

```javascript
// Test that corrupted data is rejected:
const original = new TextEncoder().encode("Original data");
const encrypted = await encryption.encryptBackup(original);

// Corrupt encrypted data
encrypted.encrypted[0] ^= 0xff;
encrypted.encrypted[encrypted.encrypted.length - 1] ^= 0xff;

try {
  await encryption.decryptBackup(encrypted);
  console.log("✗ ERROR: Should have detected corruption");
} catch (error) {
  console.log("✓ Corruption detected:", error.message);
}
```

- [ ] Corrupted data throws "Decryption failed" error
- [ ] GCM authentication tag detects tampering
- [ ] No silent data corruption

---

## Manual Smoke Tests

### 1. Basic Encryption Round-Trip

```javascript
import { BackupEncryption } from "@/lib/backup-encryption";
import { packEncryptedBackup, unpackEncryptedBackup } from "@/lib/crypto-utils";

const encryption = new BackupEncryption();
const testData = new TextEncoder().encode("Test backup data");

// Encrypt
const encrypted = await encryption.encryptBackup(testData);

// Pack for storage
const packed = packEncryptedBackup(encrypted);

// Unpack from storage
const unpacked = unpackEncryptedBackup(packed, { iv: Array.from(encrypted.iv) });

// Decrypt
const decrypted = await encryption.decryptBackup(unpacked);

// Verify
const restored = new TextDecoder().decode(decrypted);
console.log("✓ Data integrity:", restored === "Test backup data");
```

- [ ] Encryption completes without errors
- [ ] Decryption returns original data
- [ ] Pack/unpack preserves data integrity
- [ ] Process completes in <1 second for small data

---

### 2. Realistic Backup Size (1-5MB)

```javascript
// Simulate typical household backup (1000 transactions)
const typicalBackup = {
  transactions: Array(1000)
    .fill(null)
    .map((_, i) => ({
      id: `txn-${i}`,
      amount_cents: Math.floor(Math.random() * 100000),
      description: `Transaction ${i}`,
      date: "2025-01-15",
      category_id: `cat-${i % 10}`,
    })),
  accounts: Array(5)
    .fill(null)
    .map((_, i) => ({
      id: `acc-${i}`,
      name: `Account ${i}`,
      balance_cents: Math.floor(Math.random() * 1000000),
    })),
  categories: Array(20)
    .fill(null)
    .map((_, i) => ({
      id: `cat-${i}`,
      name: `Category ${i}`,
    })),
};

const jsonString = JSON.stringify(typicalBackup);
const jsonBytes = new TextEncoder().encode(jsonString);

console.time("encrypt-typical");
const encrypted = await encryption.encryptBackup(jsonBytes);
console.timeEnd("encrypt-typical");

console.time("decrypt-typical");
const decrypted = await encryption.decryptBackup(encrypted);
console.timeEnd("decrypt-typical");

const restored = JSON.parse(new TextDecoder().decode(decrypted));
console.log("✓ Data integrity:", restored.transactions.length === 1000);
```

- [ ] Backup size: 100-200 KB
- [ ] Encryption: <200ms
- [ ] Decryption: <200ms
- [ ] Data integrity: true

---

### 3. Key Re-derivation After Clearing

```javascript
const testData = new TextEncoder().encode("Test data");

// First encryption
const encrypted1 = await encryption.encryptBackup(testData);
console.log("✓ First encryption successful");

// Clear key
encryption.clearKey();
console.log("✓ Key cleared");

// Should re-derive automatically
const encrypted2 = await encryption.encryptBackup(testData);
console.log("✓ Second encryption successful (key re-derived)");

// Both should decrypt successfully
const decrypted1 = await encryption.decryptBackup(encrypted1);
const decrypted2 = await encryption.decryptBackup(encrypted2);

console.log(
  "✓ Both decrypt correctly:",
  new TextDecoder().decode(decrypted1) === new TextDecoder().decode(decrypted2)
);
```

- [ ] Key automatically re-derived after clearing
- [ ] Old encryptions still decrypt with new key derivation
- [ ] Deterministic key derivation works correctly

---

## React Hook Integration

### 4. Hook Basic Usage

```typescript
// Create test component in development:
import { useBackupEncryption } from '@/hooks/useBackupEncryption';
import { Button } from '@/components/ui/button';

function EncryptionTest() {
  const { encrypt, decrypt, isEncrypting, isDecrypting, error, isSupported } = useBackupEncryption();
  const [result, setResult] = useState<string>('');

  const testEncryption = async () => {
    try {
      const data = new TextEncoder().encode('Test from hook');
      const encrypted = await encrypt(data);
      const decrypted = await decrypt(encrypted);
      const text = new TextDecoder().decode(decrypted);
      setResult(`✓ Success: ${text}`);
    } catch (err) {
      setResult(`✗ Error: ${err.message}`);
    }
  };

  return (
    <div>
      <p>WebCrypto supported: {isSupported ? '✓' : '✗'}</p>
      <Button onClick={testEncryption} disabled={isEncrypting || isDecrypting}>
        {isEncrypting ? 'Encrypting...' : isDecrypting ? 'Decrypting...' : 'Test'}
      </Button>
      {error && <p className="text-red-500">{error.message}</p>}
      {result && <p>{result}</p>}
    </div>
  );
}
```

- [ ] Hook initializes without errors
- [ ] Loading states work correctly
- [ ] Encryption/decryption completes successfully
- [ ] Error states display properly

---

## Code Quality

### Linting

```bash
npm run lint
```

- [ ] No ESLint errors
- [ ] No TypeScript errors
- [ ] No unused imports

---

### Type Safety

- [ ] All functions have proper TypeScript types
- [ ] No `any` types used
- [ ] Proper error type definitions
- [ ] Export types from `src/types/backup.ts`

---

### Documentation

- [ ] All exported functions have JSDoc comments
- [ ] Complex logic has inline comments
- [ ] Security-critical sections well-documented
- [ ] README.md explains encryption approach

---

## Final Checklist

Before proceeding to chunk 040, confirm:

- [ ] **All test suites passing** (unit, integration, performance, browser, hook)
- [ ] **Security verification complete** (IV uniqueness, key protection, session validation, corruption detection)
- [ ] **Manual smoke tests pass** (4/4 scenarios work correctly)
- [ ] **No console.log statements with sensitive data**
- [ ] **Code quality checks pass** (linting, types, documentation)
- [ ] **Git commit created** with proper message format

---

## Commit Message Template

Once all verifications pass:

```bash
git add src/lib/backup-encryption.ts src/lib/crypto-utils.ts src/types/backup.ts src/hooks/useBackupEncryption.ts src/lib/encryption-errors.ts

git commit -m "feat: implement client-side backup encryption (chunk 039)

- Add BackupEncryption class with AES-GCM 256-bit encryption
- Implement PBKDF2 key derivation from Supabase auth (100k iterations)
- Add crypto utilities (IV generation, pack/unpack)
- Create useBackupEncryption React hook with error handling
- Add comprehensive test suites (15+ unit, 5+ integration, 6+ performance)
- Verify browser compatibility and security requirements
- All tests passing, security verification complete

Refs: chunk 039, Decision #69 (auth-derived encryption), #83 (Phase B timing)"
```

---

## Ready for Next Chunk?

✅ **All verifications complete** → Proceed to **Chunk 040: Backup Worker Orchestration**

⚠️ **Any verification failed** → Review troubleshooting.md and resolve issues before continuing

---

## Quick Troubleshooting

| Issue                     | Solution                                                               |
| ------------------------- | ---------------------------------------------------------------------- |
| Tests timeout             | Reduce PBKDF2 iterations in test env (see troubleshooting.md line 695) |
| WebCrypto not available   | Ensure HTTPS or localhost, check browser version                       |
| "No active session" error | Log in to application, verify Supabase config                          |
| Performance tests fail    | Check hardware, adjust expectations (see troubleshooting.md line 705)  |
| IV reuse detected         | Verify `crypto.getRandomValues()` is called per encryption             |
| Missing await             | See instructions.md "Common Implementation Mistakes" section           |
| Need to rollback          | See instructions.md "Rollback Strategy" section for scenarios          |

For detailed troubleshooting, see `troubleshooting.md`.

---

## Implementation Tips

Before starting implementation, review:

- **Common Mistakes** (instructions.md) - Avoid 7 predictable errors
- **Rollback Strategy** (instructions.md) - Know your exit plan if stuck
- **Quick Debug Checklist** (instructions.md) - Systematic troubleshooting steps

These sections will save you debugging time!

---

**Status**: ✅ Chunk 039 verification complete

**Next**: `../040-backup-worker/` for backup orchestration with R2 upload
