# Troubleshooting: Backup Encryption

Comprehensive troubleshooting guide for the encryption system. Covers common issues, edge cases, and debugging strategies.

---

## Category Index

1. [Key Derivation Issues](#key-derivation-issues)
2. [Encryption/Decryption Failures](#encryptiondecryption-failures)
3. [Performance Problems](#performance-problems)
4. [Browser Compatibility](#browser-compatibility)
5. [Session Management](#session-management)
6. [Data Integrity Issues](#data-integrity-issues)
7. [Memory and Resource Issues](#memory-and-resource-issues)
8. [Testing and Development](#testing-and-development)

---

## Key Derivation Issues

### Problem: "No active session" error

**Cause**: User not logged in or session expired

**Symptoms**:

- Error thrown during `deriveKeyFromAuth()` call
- Backup creation fails immediately
- No progress shown

**Solution**:

```typescript
// Refresh session before encryption
const {
  data: { session },
  error,
} = await supabase.auth.refreshSession();

if (error || !session) {
  // Prompt user to log in
  toast.error("Please log in to encrypt backups");
  router.push("/login");
  return;
}

// Now derive key
const key = await encryption.deriveKeyFromAuth();
```

**Prevention**:

- Check session validity before starting backup
- Implement session refresh logic in app
- Add session expiry warnings (15 min before expiry)

---

### Problem: Key derivation very slow (>500ms)

**Cause**: PBKDF2 with 100,000 iterations is CPU-intensive

**Symptoms**:

- Backup creation takes long time to start
- UI freezes during key derivation
- Performance tests fail

**Solution 1** - Reduce iterations (security trade-off):

```typescript
// In backup-encryption.ts
const PBKDF2_ITERATIONS = import.meta.env.DEV ? 10000 : 100000;

// Only use lower iterations in development
```

**Solution 2** - Cache derived key in memory:

```typescript
export class BackupEncryption {
  private encryptionKey: CryptoKey | null = null;
  private keyExpiryTime: number | null = null;
  private KEY_CACHE_DURATION = 10 * 60 * 1000; // 10 minutes

  async deriveKeyFromAuth(): Promise<CryptoKey> {
    // Check if cached key is still valid
    if (this.encryptionKey && this.keyExpiryTime && Date.now() < this.keyExpiryTime) {
      return this.encryptionKey;
    }

    // Derive new key
    this.encryptionKey = await this.performKeyDerivation();
    this.keyExpiryTime = Date.now() + this.KEY_CACHE_DURATION;

    return this.encryptionKey;
  }

  clearKey(): void {
    this.encryptionKey = null;
    this.keyExpiryTime = null;
  }
}
```

**Solution 3** - Use Web Workers (advanced):

```typescript
// crypto-worker.ts
self.onmessage = async (e) => {
  const { type, keyMaterial, salt } = e.data;

  if (type === 'deriveKey') {
    const baseKey = await crypto.subtle.importKey(
      "raw",
      keyMaterial,
      "PBKDF2",
      false,
      ["deriveBits", "deriveKey"]
    );

    // Make key extractable so we can export it
    const key = await crypto.subtle.deriveKey(
      { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
      baseKey,
      { name: "AES-GCM", length: 256 },
      true, // ← extractable: true (required for export)
      ["encrypt", "decrypt"]
    );

    // Export key as raw bytes (CryptoKey cannot be transferred directly)
    const exportedKey = await crypto.subtle.exportKey("raw", key);

    // Send raw bytes (ArrayBuffer can be transferred)
    self.postMessage({ exportedKey }, [exportedKey]);
  }
};

// In BackupEncryption class:
async deriveKeyFromAuth(): Promise<CryptoKey> {
  const worker = new Worker(new URL('./crypto-worker.ts', import.meta.url));

  return new Promise(async (resolve, reject) => {
    worker.onmessage = async (e) => {
      // Re-import the raw key bytes as CryptoKey (non-extractable)
      const key = await crypto.subtle.importKey(
        "raw",
        e.data.exportedKey,
        { name: "AES-GCM" },
        false, // non-extractable for security
        ["encrypt", "decrypt"]
      );

      resolve(key);
      worker.terminate();
    };

    worker.onerror = (error) => {
      reject(error);
      worker.terminate();
    };

    const session = await supabase.auth.getSession();
    const keyMaterial = new TextEncoder().encode(
      session.data.session.access_token + session.data.session.user.id
    );
    const salt = new TextEncoder().encode(session.data.session.user.id);

    worker.postMessage({ type: 'deriveKey', keyMaterial, salt });
  });
}
```

**Important**: CryptoKey objects are **non-transferable** via `postMessage`. The solution:

1. Derive key as **extractable** in worker (`true` flag)
2. Export key as raw ArrayBuffer
3. Transfer ArrayBuffer to main thread
4. Re-import as **non-extractable** CryptoKey for security

---

### Problem: Decryption fails after session refresh

**Cause**: Key re-derived with different token (should NOT happen with current implementation)

**Symptoms**:

- Old backups fail to decrypt
- Error: "Decryption failed"
- Data appears corrupted

**Diagnosis**:

```typescript
// Test if key derivation is deterministic
const encryption1 = new BackupEncryption();
const encryption2 = new BackupEncryption();

const data = new TextEncoder().encode("Test data");

// Encrypt with first instance
const encrypted = await encryption1.encryptBackup(data);

// Clear first key, decrypt with second instance
encryption1.clearKey();
const decrypted = await encryption2.decryptBackup(encrypted);

console.log("Deterministic:", new TextDecoder().decode(decrypted) === "Test data");
```

**Solution**: Auth-derived keys ARE deterministic per user. If issue persists:

```typescript
// Store encryption metadata with backup
const metadata = {
  userId: session.user.id,
  keyDerivationMethod: "auth-derived-pbkdf2",
  pbkdf2Iterations: 100000,
  createdAt: Date.now(),
};

// When decrypting, verify user ID matches
if (metadata.userId !== currentUserId) {
  throw new Error("Cannot decrypt backup from different user");
}

// Verify key derivation method matches
if (metadata.keyDerivationMethod !== "auth-derived-pbkdf2") {
  throw new Error("Unsupported key derivation method");
}
```

---

### Problem: Different keys across devices for same user

**Cause**: User ID or JWT format differs between devices

**Symptoms**:

- Backup created on Device A won't decrypt on Device B
- Both devices belong to same user
- Session appears valid on both

**Diagnosis**:

```typescript
// On Device A:
const sessionA = await supabase.auth.getSession();
console.log("User ID A:", sessionA.data.session.user.id);
console.log("Token prefix A:", sessionA.data.session.access_token.substring(0, 20));

// On Device B:
const sessionB = await supabase.auth.getSession();
console.log("User ID B:", sessionB.data.session.user.id);
console.log("Token prefix B:", sessionB.data.session.access_token.substring(0, 20));

// User IDs MUST match, tokens will differ
```

**Solution**:

Auth-derived keys use `JWT + userID` as key material, but only `userID` as salt. This ensures determinism:

```typescript
// Key material (high entropy, changes per session)
const keyMaterial = new TextEncoder().encode(session.access_token + session.user.id);

// Salt (deterministic per user)
const salt = new TextEncoder().encode(session.user.id);

// Result: Same user ID → same salt → same key (despite different JWTs)
```

If this doesn't work, implement explicit key storage in Supabase:

```typescript
// Store encrypted master key in profile
const masterKey = crypto.getRandomValues(new Uint8Array(32));

// Encrypt master key with auth-derived key
const encrypted = await encryption.encryptBackup(masterKey);

// Store in profile
await supabase
  .from("profiles")
  .update({
    encrypted_master_key: Array.from(encrypted.encrypted),
    key_iv: Array.from(encrypted.iv),
  })
  .eq("id", session.user.id);

// On other device, fetch and decrypt master key
const { data } = await supabase.from("profiles").select("encrypted_master_key, key_iv").single();
const masterKeyBytes = await encryption.decryptBackup({
  encrypted: new Uint8Array(data.encrypted_master_key),
  iv: new Uint8Array(data.key_iv),
  algorithm: "AES-GCM",
  keyDerivation: "auth-derived-pbkdf2",
});
```

---

## Encryption/Decryption Failures

### Problem: "Decryption failed" with valid key

**Cause**: Data corrupted during upload/download or wrong IV

**Symptoms**:

- Decryption throws error
- Valid session and correct user
- Encryption succeeded initially

**Diagnosis**:

```typescript
// Check if IV is correct
console.log("IV length:", encrypted.iv.length); // Should be 12

// Check if encrypted data looks reasonable
console.log("Encrypted length:", encrypted.encrypted.length); // Should be > 0

// Try to decrypt with same instance that encrypted
const encrypted = await encryption.encryptBackup(data);
const decrypted = await encryption.decryptBackup(encrypted);
// If this works, the issue is with stored data

// Check checksum
const checksum1 = await generateChecksum(encrypted.encrypted);
// ... store and retrieve ...
const checksum2 = await generateChecksum(retrievedData);
console.log("Checksums match:", checksum1 === checksum2);
```

**Solution**: Add checksum verification:

```typescript
import { generateChecksum } from "@/lib/crypto-utils";

// After encryption, before storage
const encrypted = await encryption.encryptBackup(data);
const checksum = await generateChecksum(encrypted.encrypted);

// Store checksum with metadata
const metadata = {
  iv: Array.from(encrypted.iv),
  checksum,
  algorithm: encrypted.algorithm,
};

// After retrieval, before decryption
const downloadChecksum = await generateChecksum(downloadedData);

if (checksum !== downloadChecksum) {
  throw new Error("Data corrupted during transfer. Please try downloading again.");
}

// Now safe to decrypt
const decrypted = await encryption.decryptBackup(unpacked);
```

**Prevention**:

- Always store checksums with encrypted backups
- Verify checksums before decryption
- Use HTTPS for all transfers
- Implement retry logic for failed transfers

---

### Problem: "Out of memory" with large files

**Cause**: Encrypting entire file at once (>10MB)

**Symptoms**:

- Browser tab crashes
- "Out of memory" error
- System becomes sluggish

**Diagnosis**:

```typescript
// Check backup size before encryption
const jsonString = JSON.stringify(backupData);
const sizeInMB = jsonString.length / 1024 / 1024;
console.log("Backup size:", sizeInMB.toFixed(2), "MB");

if (sizeInMB > 10) {
  console.warn("Large backup detected, consider chunking");
}
```

**Solution 1** - Chunk large files:

```typescript
async function encryptLargeFile(
  data: Uint8Array,
  chunkSize = 5 * 1024 * 1024,
  onProgress?: (progress: number) => void
) {
  const chunks: Array<{ encrypted: Uint8Array; iv: Uint8Array; index: number }> = [];
  const totalChunks = Math.ceil(data.length / chunkSize);

  for (let i = 0; i < data.length; i += chunkSize) {
    const chunk = data.slice(i, Math.min(i + chunkSize, data.length));
    const encrypted = await encryption.encryptBackup(chunk);

    chunks.push({
      encrypted: encrypted.encrypted,
      iv: encrypted.iv,
      index: chunks.length,
    });

    onProgress?.((chunks.length / totalChunks) * 100);
  }

  return chunks;
}

// Decrypt chunks
async function decryptLargeFile(
  chunks: Array<{ encrypted: Uint8Array; iv: Uint8Array; index: number }>,
  onProgress?: (progress: number) => void
): Promise<Uint8Array> {
  const decryptedChunks: Uint8Array[] = [];

  // Sort by index to ensure correct order
  chunks.sort((a, b) => a.index - b.index);

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const decrypted = await encryption.decryptBackup({
      encrypted: chunk.encrypted,
      iv: chunk.iv,
      algorithm: "AES-GCM",
      keyDerivation: "auth-derived-pbkdf2",
    });

    decryptedChunks.push(decrypted);
    onProgress?.(((i + 1) / chunks.length) * 100);
  }

  // Concatenate all chunks
  const totalLength = decryptedChunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;

  for (const chunk of decryptedChunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result;
}
```

**Solution 2** - Use streaming encryption (Web Crypto Streams API):

```typescript
// Note: Streaming AES-GCM not widely supported yet
// Fall back to chunking for now

async function* encryptStream(stream: ReadableStream<Uint8Array>): AsyncGenerator<EncryptedBackup> {
  const reader = stream.getReader();
  let chunk;

  while (!(chunk = await reader.read()).done) {
    yield await encryption.encryptBackup(chunk.value);
  }
}
```

---

### Problem: Encrypted data larger than expected

**Cause**: AES-GCM adds authentication tag (16 bytes) + IV stored separately

**Symptoms**:

- Encrypted backup slightly larger than original
- Storage costs higher than anticipated

**Explanation**:

```typescript
const original = new Uint8Array(1000); // 1000 bytes
const encrypted = await encryption.encryptBackup(original);

console.log("Original:", original.length); // 1000 bytes
console.log("Encrypted:", encrypted.encrypted.length); // 1016 bytes (1000 + 16-byte tag)
console.log("IV:", encrypted.iv.length); // 12 bytes
console.log("Total:", encrypted.encrypted.length + encrypted.iv.length); // 1028 bytes

// Overhead: ~28 bytes per encryption (2.8% for 1KB, 0.28% for 10KB)
```

**This is normal**. AES-GCM adds:

- 16-byte authentication tag (integrity check)
- 12-byte IV (unique per encryption)

**Solution**: No action needed. Factor this into storage calculations:

```typescript
function estimateEncryptedSize(originalSizeBytes: number): number {
  return originalSizeBytes + 28; // 16-byte tag + 12-byte IV
}
```

---

###Problem: IV reuse detected (same IV for multiple encryptions)

**Cause**: Faulty random number generator or test mocks not properly reset

**Symptoms**:

- Security warning in tests
- Multiple encryptions produce identical ciphertext
- IV uniqueness tests fail

**Diagnosis**:

```typescript
const ivs = new Set<string>();

for (let i = 0; i < 100; i++) {
  const encrypted = await encryption.encryptBackup(testData);
  const ivString = Array.from(encrypted.iv).join(",");

  if (ivs.has(ivString)) {
    console.error("CRITICAL: IV reused at iteration", i);
    break;
  }

  ivs.add(ivString);
}

console.log("Unique IVs:", ivs.size, "/ 100");
```

**Solution**:

Ensure `crypto.getRandomValues()` is called for each encryption:

```typescript
export function generateIV(): Uint8Array {
  // ALWAYS generate fresh random bytes
  return crypto.getRandomValues(new Uint8Array(12));
}

// In encryptBackup:
const iv = generateIV(); // New IV every time, never reuse!
```

**Prevention**:

- Never cache IVs
- Never use deterministic IV generation
- Always use `crypto.getRandomValues()` for IVs
- Add IV uniqueness tests to test suite

---

### Problem: Encryption succeeds but decryption gives garbage data

**Cause**: Wrong key used for decryption, or data corruption

**Symptoms**:

- No error thrown
- Decrypted data is random bytes
- JSON.parse fails on decrypted data

**Diagnosis**:

```typescript
const original = new TextEncoder().encode("Test data");
const encrypted = await encryption.encryptBackup(original);

// Try decrypting with same key
const decrypted1 = await encryption.decryptBackup(encrypted);
console.log("Same key result:", new TextDecoder().decode(decrypted1));

// Try decrypting with different key (simulate wrong user)
encryption.clearKey();
// Mock different user session here
const decrypted2 = await encryption.decryptBackup(encrypted);
console.log("Different key result:", new TextDecoder().decode(decrypted2));
// This should throw "Decryption failed" error
```

**Solution**:

AES-GCM includes authentication, so this should NOT happen. If it does:

```typescript
try {
  const decrypted = await encryption.decryptBackup(encrypted);

  // Verify decrypted data is valid UTF-8
  const text = new TextDecoder("utf-8", { fatal: true }).decode(decrypted);

  // Try parsing as JSON
  const data = JSON.parse(text);

  console.log("✓ Decryption successful and valid");
} catch (error) {
  if (error.name === "OperationError") {
    console.error("✗ Decryption failed (wrong key or corrupted data)");
  } else if (error instanceof SyntaxError) {
    console.error("✗ Decryption produced invalid JSON");
  } else {
    console.error("✗ Decryption produced invalid UTF-8");
  }

  throw error;
}
```

---

## Performance Issues

### Problem: Key derivation too slow (>500ms)

**Cause**: PBKDF2 iterations too high

**Solution**: Reduce iterations (security trade-off):

```typescript
// Original: 100,000 iterations
const PBKDF2_ITERATIONS = 50000; // Faster, still secure

// Or cache key in memory
let cachedKey: CryptoKey | null = null;

async function getCachedKey() {
  if (!cachedKey) {
    cachedKey = await deriveKeyFromAuth();
  }
  return cachedKey;
}
```

---

## Browser Compatibility Issues

### Problem: WebCrypto API not available

**Cause**: HTTP (not HTTPS) or old browser

**Solution**:

```typescript
if (!window.crypto || !window.crypto.subtle) {
  throw new Error("WebCrypto API not available. Please use HTTPS or update your browser.");
}
```

---

## Prevention Tips

1. **Always use HTTPS**: WebCrypto requires secure context
2. **Test with large data**: Verify memory handling
3. **Log operations**: Track encryption/decryption timing
4. **Verify checksums**: Detect corruption early
5. **Clear keys**: Always clear after use

---

**Quick Fix**:

```bash
# Reset encryption state
localStorage.removeItem('encryption-cache');

# Clear service worker cache
// In DevTools Application tab
```
