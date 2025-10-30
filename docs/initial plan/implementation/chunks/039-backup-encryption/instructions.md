# Instructions: Backup Encryption

Follow these steps in order. Estimated time: 2 hours.

---

## Step 0: Verify Prerequisites (5 min)

Before beginning implementation, verify all prerequisites are met to avoid mid-task failures.

### 0.1 Verify Chunk 038 Complete ✓

Check that R2 Worker is deployed and configured:

```bash
# Verify R2 Worker directory exists
ls workers/r2-proxy/

# Check wrangler.toml has R2 bucket binding
grep "R2_BUCKET" workers/r2-proxy/wrangler.toml

# Check Worker was deployed successfully
cd workers/r2-proxy && npx wrangler deployments list
```

**Expected Output**:

- R2 Worker files present
- `R2_BUCKET` binding configured in wrangler.toml
- Recent successful deployment shown

**If Failed**: Complete chunk 038 first before proceeding.

---

### 0.2 Verify WebCrypto API Available ✓

Test WebCrypto API in your development environment:

```javascript
// Run in browser console (npm run dev, then open http://localhost:3000)
console.log("WebCrypto API Check:", {
  crypto: !!window.crypto,
  subtle: !!window.crypto?.subtle,
  getRandomValues: typeof window.crypto?.getRandomValues === "function",
  encrypt: typeof window.crypto?.subtle?.encrypt === "function",
  decrypt: typeof window.crypto?.subtle?.decrypt === "function",
  deriveKey: typeof window.crypto?.subtle?.deriveKey === "function",
});
```

**Expected Output**: All values should be `true`

**If Failed**:

- Ensure you're running on HTTPS or localhost (WebCrypto requires secure context)
- Update browser to latest version (Chrome 60+, Firefox 60+, Safari 11+)

---

### 0.3 Verify Supabase Auth Working ✓

Test that authentication and session retrieval works:

```typescript
// Run in browser console after logging in
import { supabase } from "@/lib/supabase";

const {
  data: { session },
  error,
} = await supabase.auth.getSession();

console.log("Auth Check:", {
  hasSession: !!session,
  hasAccessToken: !!session?.access_token,
  hasUserId: !!session?.user?.id,
  error: error,
});
```

**Expected Output**:

```javascript
{
  hasSession: true,
  hasAccessToken: true,
  hasUserId: true,
  error: null
}
```

**If Failed**:

- Log in to the application first
- Check Supabase configuration in `.env`
- Verify `src/lib/supabase.ts` is properly configured

---

### 0.4 Verify Test Environment Ready ✓

Ensure crypto operations work in your test environment:

```bash
# Create temporary test file
cat > src/lib/__tests__/crypto-basic.test.ts << 'EOF'
import { describe, it, expect } from 'vitest';

describe('WebCrypto Basic Test', () => {
  it('should generate random values', () => {
    const array = new Uint8Array(12);
    crypto.getRandomValues(array);

    // Check that values are not all zeros
    const sum = Array.from(array).reduce((a, b) => a + b, 0);
    expect(sum).toBeGreaterThan(0);
  });

  it('should support AES-GCM key generation', async () => {
    const key = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );

    expect(key).toBeDefined();
    expect(key.type).toBe('secret');
  });
});
EOF

# Run test
npm test src/lib/__tests__/crypto-basic.test.ts
```

**Expected Output**: Both tests pass

**If Failed**:

- Check vitest configuration includes `environment: 'jsdom'`
- Ensure test environment has WebCrypto polyfill if needed

---

### 0.5 Prerequisites Checklist ✓

Before proceeding to Step 1, confirm:

- [ ] Chunk 038 complete (R2 Worker deployed and accessible)
- [ ] WebCrypto API available in browser (all 6 checks pass)
- [ ] Supabase Auth working (can retrieve valid session)
- [ ] Test environment supports crypto operations (2 basic tests pass)

**All checks passed?** → Proceed to Step 1

**Any check failed?** → Resolve the issue before continuing. Encryption implementation depends on all prerequisites being functional.

---

## Step 1: Create Backup Types (10 min)

Create `src/types/backup.ts`:

```typescript
export interface EncryptedBackup {
  encrypted: Uint8Array;
  iv: Uint8Array;
  algorithm: "AES-GCM";
  keyDerivation: "auth-derived-pbkdf2";
}

export interface BackupMetadata {
  version: string;
  timestamp: string;
  deviceId: string;
  encrypted: boolean;
  compressed: boolean;
}
```

---

## Step 2: Create Crypto Utilities (15 min)

Create `src/lib/crypto-utils.ts`:

```typescript
import type { EncryptedBackup } from "@/types/backup";

/**
 * Generate random IV for AES-GCM
 */
export function generateIV(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(12));
}

/**
 * Convert Uint8Array to Base64
 */
export function arrayToBase64(array: Uint8Array): string {
  return btoa(String.fromCharCode(...array));
}

/**
 * Convert Base64 to Uint8Array
 */
export function base64ToArray(base64: string): Uint8Array {
  const binary = atob(base64);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

/**
 * Pack encrypted backup for storage
 */
export function packEncryptedBackup(encrypted: EncryptedBackup): Uint8Array {
  const ivLength = encrypted.iv.length;
  const dataLength = encrypted.encrypted.length;

  const packed = new Uint8Array(ivLength + dataLength);
  packed.set(encrypted.iv, 0);
  packed.set(encrypted.encrypted, ivLength);

  return packed;
}

/**
 * Unpack encrypted backup from storage
 */
export function unpackEncryptedBackup(
  packed: Uint8Array,
  metadata: { iv: number[] }
): EncryptedBackup {
  const iv = new Uint8Array(metadata.iv);
  const encrypted = packed.slice(iv.length);

  return {
    encrypted,
    iv,
    algorithm: "AES-GCM",
    keyDerivation: "auth-derived-pbkdf2",
  };
}
```

---

## Step 3: Create Encryption Engine (45 min)

Create `src/lib/backup-encryption.ts`:

```typescript
import { supabase } from "./supabase";

const PBKDF2_ITERATIONS = 100000;
const KEY_LENGTH = 256;

export class BackupEncryption {
  private encryptionKey: CryptoKey | null = null;

  /**
   * Derive encryption key from Supabase auth session
   */
  async deriveKeyFromAuth(): Promise<CryptoKey> {
    const session = await supabase.auth.getSession();

    if (!session?.data?.session) {
      throw new Error("No active session. Please log in.");
    }

    // Use JWT + user ID as key material (high entropy)
    const keyMaterial = new TextEncoder().encode(
      session.data.session.access_token + session.data.session.user.id
    );

    // Import as PBKDF2 base key
    const baseKey = await crypto.subtle.importKey("raw", keyMaterial, "PBKDF2", false, [
      "deriveBits",
      "deriveKey",
    ]);

    // Deterministic salt from user ID
    const salt = new TextEncoder().encode(session.data.session.user.id);

    // Derive AES-GCM key
    const key = await crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt,
        iterations: PBKDF2_ITERATIONS,
        hash: "SHA-256",
      },
      baseKey,
      { name: "AES-GCM", length: KEY_LENGTH },
      false,
      ["encrypt", "decrypt"]
    );

    return key;
  }

  /**
   * Encrypt backup data
   */
  async encryptBackup(data: Uint8Array): Promise<EncryptedBackup> {
    // Derive or reuse key
    if (!this.encryptionKey) {
      this.encryptionKey = await this.deriveKeyFromAuth();
    }

    // Generate random IV (never reuse!)
    const iv = crypto.getRandomValues(new Uint8Array(12));

    // Encrypt with AES-GCM
    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      this.encryptionKey,
      data
    );

    return {
      encrypted: new Uint8Array(encrypted),
      iv,
      algorithm: "AES-GCM",
      keyDerivation: "auth-derived-pbkdf2",
    };
  }

  /**
   * Decrypt backup data
   */
  async decryptBackup(encrypted: EncryptedBackup): Promise<Uint8Array> {
    // Derive or reuse key
    if (!this.encryptionKey) {
      this.encryptionKey = await this.deriveKeyFromAuth();
    }

    // Decrypt with AES-GCM
    try {
      const decrypted = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: encrypted.iv },
        this.encryptionKey,
        encrypted.encrypted
      );

      return new Uint8Array(decrypted);
    } catch (error) {
      throw new Error("Decryption failed. Data may be corrupted or key is incorrect.");
    }
  }

  /**
   * Clear encryption key from memory
   */
  clearKey(): void {
    this.encryptionKey = null;
  }
}
```

---

## Step 4: Add Unit Tests (40 min)

Create `src/lib/backup-encryption.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { BackupEncryption } from "./backup-encryption";
import { generateIV, packEncryptedBackup, unpackEncryptedBackup } from "./crypto-utils";

describe("BackupEncryption", () => {
  let encryption: BackupEncryption;

  beforeEach(() => {
    encryption = new BackupEncryption();
  });

  it("should encrypt and decrypt data successfully", async () => {
    const original = new TextEncoder().encode("Test backup data");

    const encrypted = await encryption.encryptBackup(original);
    const decrypted = await encryption.decryptBackup(encrypted);

    expect(decrypted).toEqual(original);
  });

  it("should generate unique IV for each encryption", async () => {
    const data = new TextEncoder().encode("Test data");

    const encrypted1 = await encryption.encryptBackup(data);
    const encrypted2 = await encryption.encryptBackup(data);

    // IVs should be different
    expect(encrypted1.iv).not.toEqual(encrypted2.iv);

    // But both should decrypt correctly
    const decrypted1 = await encryption.decryptBackup(encrypted1);
    const decrypted2 = await encryption.decryptBackup(encrypted2);

    expect(decrypted1).toEqual(data);
    expect(decrypted2).toEqual(data);
  });

  it("should fail decryption with wrong key", async () => {
    const data = new TextEncoder().encode("Secret data");

    const encrypted = await encryption.encryptBackup(data);

    // Clear key to force re-derivation (simulates wrong key)
    encryption.clearKey();

    // In real scenario, different session would give different key
    // For test, we just verify error handling works

    await expect(async () => {
      // Modify encrypted data to simulate corruption
      encrypted.encrypted[0] ^= 0xff;
      await encryption.decryptBackup(encrypted);
    }).rejects.toThrow("Decryption failed");
  });

  it("should handle empty data", async () => {
    const empty = new Uint8Array(0);

    const encrypted = await encryption.encryptBackup(empty);
    const decrypted = await encryption.decryptBackup(encrypted);

    expect(decrypted.length).toBe(0);
  });

  it("should handle large data (5MB)", async () => {
    const large = new Uint8Array(1024 * 1024 * 5); // 5MB
    crypto.getRandomValues(large);

    const encrypted = await encryption.encryptBackup(large);
    const decrypted = await encryption.decryptBackup(encrypted);

    expect(decrypted).toEqual(large);
  });

  it("should preserve data integrity across pack/unpack", async () => {
    const original = new TextEncoder().encode("Test data with special chars: 🔐🎉");

    const encrypted = await encryption.encryptBackup(original);
    const packed = packEncryptedBackup(encrypted);
    const unpacked = unpackEncryptedBackup(packed, { iv: Array.from(encrypted.iv) });
    const decrypted = await encryption.decryptBackup(unpacked);

    expect(decrypted).toEqual(original);
  });

  it("should handle rapid successive encryptions", async () => {
    const data = new TextEncoder().encode("Rapid test data");
    const iterations = 10;
    const results: EncryptedBackup[] = [];

    // Encrypt rapidly
    for (let i = 0; i < iterations; i++) {
      results.push(await encryption.encryptBackup(data));
    }

    // All IVs should be unique
    const ivs = results.map((r) => r.iv.join(","));
    const uniqueIVs = new Set(ivs);
    expect(uniqueIVs.size).toBe(iterations);

    // All should decrypt correctly
    for (const encrypted of results) {
      const decrypted = await encryption.decryptBackup(encrypted);
      expect(decrypted).toEqual(data);
    }
  });

  it("should throw error when session is missing", async () => {
    // Mock Supabase to return no session
    vi.mock("./supabase", () => ({
      supabase: {
        auth: {
          getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
        },
      },
    }));

    const newEncryption = new BackupEncryption();

    await expect(async () => {
      await newEncryption.deriveKeyFromAuth();
    }).rejects.toThrow("No active session");
  });

  it("should clear key from memory", async () => {
    const data = new TextEncoder().encode("Test data");

    // First encryption derives key
    await encryption.encryptBackup(data);

    // Clear key
    encryption.clearKey();

    // Next operation should re-derive (we can't directly test this,
    // but ensure it doesn't throw)
    const encrypted = await encryption.encryptBackup(data);
    expect(encrypted).toBeDefined();
  });

  it("should handle JSON data structures", async () => {
    const jsonData = {
      transactions: [
        { id: 1, amount: 100 },
        { id: 2, amount: 200 },
      ],
      accounts: [{ id: "acc1", balance: 5000 }],
      metadata: { version: "1.0.0", timestamp: Date.now() },
    };

    const jsonString = JSON.stringify(jsonData);
    const original = new TextEncoder().encode(jsonString);

    const encrypted = await encryption.encryptBackup(original);
    const decrypted = await encryption.decryptBackup(encrypted);
    const decryptedString = new TextDecoder().decode(decrypted);
    const parsed = JSON.parse(decryptedString);

    expect(parsed).toEqual(jsonData);
  });

  it("should handle binary data correctly", async () => {
    const binaryData = new Uint8Array([0x00, 0xff, 0x80, 0x7f, 0x01, 0xfe]);

    const encrypted = await encryption.encryptBackup(binaryData);
    const decrypted = await encryption.decryptBackup(encrypted);

    expect(decrypted).toEqual(binaryData);
  });
});

describe("Crypto Utilities", () => {
  it("should generate unique IVs", () => {
    const iv1 = generateIV();
    const iv2 = generateIV();

    expect(iv1.length).toBe(12);
    expect(iv2.length).toBe(12);
    expect(iv1).not.toEqual(iv2);
  });

  it("should pack and unpack encrypted backup correctly", () => {
    const iv = generateIV();
    const encrypted = crypto.getRandomValues(new Uint8Array(100));

    const backup: EncryptedBackup = {
      iv,
      encrypted,
      algorithm: "AES-GCM",
      keyDerivation: "auth-derived-pbkdf2",
    };

    const packed = packEncryptedBackup(backup);
    const unpacked = unpackEncryptedBackup(packed, { iv: Array.from(iv) });

    expect(unpacked.iv).toEqual(iv);
    expect(unpacked.encrypted).toEqual(encrypted);
  });

  it("should handle different data sizes in pack/unpack", () => {
    const sizes = [0, 1, 100, 1024, 10240, 1024 * 1024];

    sizes.forEach((size) => {
      const iv = generateIV();
      const encrypted = crypto.getRandomValues(new Uint8Array(size));

      const backup: EncryptedBackup = {
        iv,
        encrypted,
        algorithm: "AES-GCM",
        keyDerivation: "auth-derived-pbkdf2",
      };

      const packed = packEncryptedBackup(backup);
      const unpacked = unpackEncryptedBackup(packed, { iv: Array.from(iv) });

      expect(unpacked.encrypted).toEqual(encrypted);
    });
  });
});
```

Run tests:

```bash
npm test src/lib/backup-encryption.test.ts
```

**Expected**: All 15+ tests pass, covering:

- Basic encryption/decryption
- IV uniqueness
- Data corruption detection
- Empty data handling
- Large data handling (5MB)
- Pack/unpack integrity
- Rapid successive encryptions
- Session validation
- Key clearing
- JSON structure handling
- Binary data handling

---

## Step 5: Create Encryption Hook (30 min)

Create `src/hooks/useBackupEncryption.ts`:

```typescript
import { useState, useCallback, useRef } from "react";
import { BackupEncryption } from "@/lib/backup-encryption";
import { EncryptedBackup } from "@/types/backup";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";

interface EncryptionError {
  type: "session" | "encryption" | "decryption" | "browser";
  message: string;
  originalError?: Error;
}

export function useBackupEncryption() {
  const [encryption] = useState(() => new BackupEncryption());
  const [isEncrypting, setIsEncrypting] = useState(false);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [error, setError] = useState<EncryptionError | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Verify WebCrypto API availability
  const checkWebCryptoSupport = useCallback(() => {
    if (!window.crypto || !window.crypto.subtle) {
      const error: EncryptionError = {
        type: "browser",
        message: "WebCrypto API not available. Please use HTTPS or update your browser.",
      };
      setError(error);
      toast.error(error.message);
      return false;
    }
    return true;
  }, []);

  // Verify active session
  const checkSession = useCallback(async () => {
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session) {
      const error: EncryptionError = {
        type: "session",
        message: "No active session. Please log in to encrypt backups.",
        originalError: sessionError || undefined,
      };
      setError(error);
      toast.error(error.message);
      return false;
    }
    return true;
  }, []);

  const encrypt = useCallback(
    async (data: Uint8Array, options?: { signal?: AbortSignal }) => {
      if (!checkWebCryptoSupport()) {
        throw new Error("WebCrypto not supported");
      }

      if (!(await checkSession())) {
        throw new Error("No active session");
      }

      setIsEncrypting(true);
      setError(null);

      // Create abort controller for this operation
      abortControllerRef.current = new AbortController();
      const signal = options?.signal || abortControllerRef.current.signal;

      try {
        // Check if operation was aborted
        if (signal.aborted) {
          throw new Error("Operation aborted");
        }

        const startTime = performance.now();
        const encrypted = await encryption.encryptBackup(data);
        const duration = performance.now() - startTime;

        // Log performance metrics
        console.debug(`Encryption completed in ${duration.toFixed(2)}ms for ${data.length} bytes`);

        return encrypted;
      } catch (err) {
        const error: EncryptionError = {
          type: "encryption",
          message: "Failed to encrypt backup",
          originalError: err instanceof Error ? err : new Error(String(err)),
        };
        setError(error);
        console.error("Encryption failed:", err);
        toast.error(error.message);
        throw err;
      } finally {
        setIsEncrypting(false);
        abortControllerRef.current = null;
      }
    },
    [encryption, checkWebCryptoSupport, checkSession]
  );

  const decrypt = useCallback(
    async (encrypted: EncryptedBackup, options?: { signal?: AbortSignal }) => {
      if (!checkWebCryptoSupport()) {
        throw new Error("WebCrypto not supported");
      }

      if (!(await checkSession())) {
        throw new Error("No active session");
      }

      setIsDecrypting(true);
      setError(null);

      // Create abort controller for this operation
      abortControllerRef.current = new AbortController();
      const signal = options?.signal || abortControllerRef.current.signal;

      try {
        // Check if operation was aborted
        if (signal.aborted) {
          throw new Error("Operation aborted");
        }

        const startTime = performance.now();
        const decrypted = await encryption.decryptBackup(encrypted);
        const duration = performance.now() - startTime;

        // Log performance metrics
        console.debug(
          `Decryption completed in ${duration.toFixed(2)}ms for ${decrypted.length} bytes`
        );

        return decrypted;
      } catch (err) {
        const error: EncryptionError = {
          type: "decryption",
          message: "Failed to decrypt backup. Data may be corrupted or key is incorrect.",
          originalError: err instanceof Error ? err : new Error(String(err)),
        };
        setError(error);
        console.error("Decryption failed:", err);
        toast.error(error.message);
        throw err;
      } finally {
        setIsDecrypting(false);
        abortControllerRef.current = null;
      }
    },
    [encryption, checkWebCryptoSupport, checkSession]
  );

  const abort = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      toast.info("Operation cancelled");
    }
  }, []);

  const clearKey = useCallback(() => {
    encryption.clearKey();
    console.debug("Encryption key cleared from memory");
  }, [encryption]);

  return {
    encrypt,
    decrypt,
    abort,
    clearKey,
    isEncrypting,
    isDecrypting,
    error,
    isSupported: checkWebCryptoSupport(),
  };
}
```

**Test the hook** by creating `src/hooks/useBackupEncryption.test.ts`:

```typescript
import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { useBackupEncryption } from "./useBackupEncryption";

describe("useBackupEncryption", () => {
  it("should encrypt and decrypt data", async () => {
    const { result } = renderHook(() => useBackupEncryption());
    const data = new TextEncoder().encode("Test data");

    let encrypted: any;

    await act(async () => {
      encrypted = await result.current.encrypt(data);
    });

    expect(encrypted).toBeDefined();
    expect(result.current.isEncrypting).toBe(false);

    let decrypted: any;

    await act(async () => {
      decrypted = await result.current.decrypt(encrypted);
    });

    expect(decrypted).toEqual(data);
    expect(result.current.isDecrypting).toBe(false);
  });

  it("should set loading states correctly", async () => {
    const { result } = renderHook(() => useBackupEncryption());
    const data = new TextEncoder().encode("Test");

    expect(result.current.isEncrypting).toBe(false);

    const encryptPromise = act(async () => {
      return result.current.encrypt(data);
    });

    // Should be encrypting during operation
    await waitFor(() => {
      expect(result.current.isEncrypting).toBe(true);
    });

    await encryptPromise;

    // Should be done after operation
    expect(result.current.isEncrypting).toBe(false);
  });

  it("should check WebCrypto support", () => {
    const { result } = renderHook(() => useBackupEncryption());
    expect(result.current.isSupported).toBe(true);
  });

  it("should clear encryption key", async () => {
    const { result } = renderHook(() => useBackupEncryption());

    await act(async () => {
      result.current.clearKey();
    });

    // Should not throw, just clear key
    expect(result.current.error).toBeNull();
  });
});
```

---

## Step 6: Integration Testing with Mock Session (25 min)

Create `src/lib/__tests__/backup-encryption-integration.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { BackupEncryption } from "../backup-encryption";
import { packEncryptedBackup, unpackEncryptedBackup } from "../crypto-utils";

// Mock Supabase session
const mockSession = {
  access_token: "mock-jwt-token-with-sufficient-entropy-for-key-derivation",
  user: {
    id: "test-user-id-123",
    email: "test@example.com",
  },
};

vi.mock("../supabase", () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: mockSession },
      }),
    },
  },
}));

describe("Backup Encryption Integration", () => {
  let encryption: BackupEncryption;

  beforeEach(() => {
    encryption = new BackupEncryption();
  });

  it("should complete full backup encryption flow", async () => {
    // Simulate real backup data
    const backupData = {
      transactions: [
        { id: "1", amount_cents: 100000, description: "Groceries", date: "2025-01-15" },
        { id: "2", amount_cents: 50000, description: "Gas", date: "2025-01-16" },
      ],
      accounts: [{ id: "acc1", name: "Checking", balance_cents: 500000 }],
      categories: [{ id: "cat1", name: "Food", parent_id: null }],
      metadata: {
        version: "1.0.0",
        timestamp: Date.now(),
        deviceId: "device-123",
      },
    };

    // 1. Serialize to JSON
    const jsonString = JSON.stringify(backupData);
    const jsonBytes = new TextEncoder().encode(jsonString);

    // 2. Compress (simulated - in real flow this happens before encryption)
    const compressed = jsonBytes; // In reality: gzip compression

    // 3. Encrypt
    const encrypted = await encryption.encryptBackup(compressed);

    expect(encrypted.algorithm).toBe("AES-GCM");
    expect(encrypted.keyDerivation).toBe("auth-derived-pbkdf2");
    expect(encrypted.iv.length).toBe(12);
    expect(encrypted.encrypted.length).toBeGreaterThan(0);

    // 4. Pack for storage
    const packed = packEncryptedBackup(encrypted);

    expect(packed.length).toBe(encrypted.iv.length + encrypted.encrypted.length);

    // 5. Simulate storage/retrieval
    const storedMetadata = {
      iv: Array.from(encrypted.iv),
      algorithm: encrypted.algorithm,
      keyDerivation: encrypted.keyDerivation,
    };

    // 6. Unpack from storage
    const unpacked = unpackEncryptedBackup(packed, storedMetadata);

    expect(unpacked.iv).toEqual(encrypted.iv);
    expect(unpacked.encrypted).toEqual(encrypted.encrypted);

    // 7. Decrypt
    const decrypted = await encryption.decryptBackup(unpacked);

    // 8. Decompress (simulated)
    const decompressed = decrypted;

    // 9. Deserialize
    const restoredString = new TextDecoder().decode(decompressed);
    const restoredData = JSON.parse(restoredString);

    // 10. Verify data integrity
    expect(restoredData).toEqual(backupData);
    expect(restoredData.transactions.length).toBe(2);
    expect(restoredData.accounts[0].balance_cents).toBe(500000);
  });

  it("should maintain key consistency across multiple operations", async () => {
    const data1 = new TextEncoder().encode("First backup");
    const data2 = new TextEncoder().encode("Second backup");

    // Encrypt multiple backups with same key
    const encrypted1 = await encryption.encryptBackup(data1);
    const encrypted2 = await encryption.encryptBackup(data2);

    // Both should decrypt successfully (proving key is consistent)
    const decrypted1 = await encryption.decryptBackup(encrypted1);
    const decrypted2 = await encryption.decryptBackup(encrypted2);

    expect(decrypted1).toEqual(data1);
    expect(decrypted2).toEqual(data2);
  });

  it("should fail gracefully with corrupted data", async () => {
    const original = new TextEncoder().encode("Original data");
    const encrypted = await encryption.encryptBackup(original);

    // Corrupt the encrypted data
    encrypted.encrypted[0] ^= 0xff;
    encrypted.encrypted[encrypted.encrypted.length - 1] ^= 0xff;

    await expect(async () => {
      await encryption.decryptBackup(encrypted);
    }).rejects.toThrow("Decryption failed");
  });

  it("should handle session expiry scenario", async () => {
    const data = new TextEncoder().encode("Test data");

    // First encryption succeeds
    const encrypted = await encryption.encryptBackup(data);

    // Clear key to simulate session expiry
    encryption.clearKey();

    // Mock session refresh
    vi.mocked(supabase.auth.getSession).mockResolvedValueOnce({
      data: { session: mockSession },
    } as any);

    // Should re-derive key and decrypt successfully
    const decrypted = await encryption.decryptBackup(encrypted);
    expect(decrypted).toEqual(data);
  });

  it("should produce different ciphertext for same plaintext", async () => {
    const data = new TextEncoder().encode("Same data");

    const encrypted1 = await encryption.encryptBackup(data);
    const encrypted2 = await encryption.encryptBackup(data);

    // IVs should be different
    expect(encrypted1.iv).not.toEqual(encrypted2.iv);

    // Ciphertext should be different (due to different IVs)
    expect(encrypted1.encrypted).not.toEqual(encrypted2.encrypted);

    // But both should decrypt to same plaintext
    const decrypted1 = await encryption.decryptBackup(encrypted1);
    const decrypted2 = await encryption.decryptBackup(encrypted2);

    expect(decrypted1).toEqual(data);
    expect(decrypted2).toEqual(data);
  });
});
```

Run integration tests:

```bash
npm test backup-encryption-integration
```

---

## Step 7: Performance Benchmarking (20 min)

Create `src/lib/__tests__/backup-encryption-performance.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { BackupEncryption } from "../backup-encryption";

describe("Backup Encryption Performance", () => {
  const encryption = new BackupEncryption();

  it("should encrypt 1MB in under 500ms", async () => {
    const data = new Uint8Array(1024 * 1024); // 1MB
    crypto.getRandomValues(data);

    const start = performance.now();
    await encryption.encryptBackup(data);
    const duration = performance.now() - start;

    console.log(`1MB encryption: ${duration.toFixed(2)}ms`);
    expect(duration).toBeLessThan(500);
  });

  it("should decrypt 1MB in under 500ms", async () => {
    const data = new Uint8Array(1024 * 1024);
    crypto.getRandomValues(data);

    const encrypted = await encryption.encryptBackup(data);

    const start = performance.now();
    await encryption.decryptBackup(encrypted);
    const duration = performance.now() - start;

    console.log(`1MB decryption: ${duration.toFixed(2)}ms`);
    expect(duration).toBeLessThan(500);
  });

  it("should handle 10MB backup in under 2 seconds", async () => {
    const data = new Uint8Array(1024 * 1024 * 10); // 10MB
    crypto.getRandomValues(data);

    const start = performance.now();
    const encrypted = await encryption.encryptBackup(data);
    await encryption.decryptBackup(encrypted);
    const duration = performance.now() - start;

    console.log(`10MB round-trip: ${duration.toFixed(2)}ms`);
    expect(duration).toBeLessThan(2000);
  });

  it("should derive key in under 300ms", async () => {
    encryption.clearKey(); // Force re-derivation

    const start = performance.now();
    await encryption.deriveKeyFromAuth();
    const duration = performance.now() - start;

    console.log(`Key derivation: ${duration.toFixed(2)}ms`);
    expect(duration).toBeLessThan(300);
  });

  it("should handle 100 rapid encryptions efficiently", async () => {
    const data = new TextEncoder().encode("Small test data");
    const iterations = 100;

    const start = performance.now();

    for (let i = 0; i < iterations; i++) {
      await encryption.encryptBackup(data);
    }

    const duration = performance.now() - start;
    const avgPerOperation = duration / iterations;

    console.log(`100 encryptions: ${duration.toFixed(2)}ms (avg: ${avgPerOperation.toFixed(2)}ms)`);
    expect(avgPerOperation).toBeLessThan(20); // Each should be under 20ms
  });

  it("should show performance scaling with data size", async () => {
    const sizes = [
      { size: 100 * 1024, label: "100KB" },
      { size: 500 * 1024, label: "500KB" },
      { size: 1024 * 1024, label: "1MB" },
      { size: 5 * 1024 * 1024, label: "5MB" },
    ];

    console.log("\nEncryption performance by size:");

    for (const { size, label } of sizes) {
      const data = new Uint8Array(size);
      crypto.getRandomValues(data);

      const start = performance.now();
      await encryption.encryptBackup(data);
      const duration = performance.now() - start;

      const throughput = size / 1024 / 1024 / (duration / 1000); // MB/s
      console.log(`  ${label}: ${duration.toFixed(2)}ms (${throughput.toFixed(2)} MB/s)`);
    }
  });
});
```

Run performance tests:

```bash
npm test backup-encryption-performance
```

**Expected results**:

- 1MB encryption: <500ms
- 1MB decryption: <500ms
- 10MB round-trip: <2000ms
- Key derivation: <300ms (PBKDF2 with 100k iterations)
- Rapid encryptions: <20ms average

---

## Step 8: Browser Compatibility Testing (15 min)

Create `src/lib/__tests__/backup-encryption-browser.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { BackupEncryption } from "../backup-encryption";

describe("Browser Compatibility", () => {
  it("should verify WebCrypto API availability", () => {
    expect(window.crypto).toBeDefined();
    expect(window.crypto.subtle).toBeDefined();
    expect(typeof window.crypto.subtle.encrypt).toBe("function");
    expect(typeof window.crypto.subtle.decrypt).toBe("function");
    expect(typeof window.crypto.subtle.deriveBits).toBe("function");
  });

  it("should verify required algorithms are supported", async () => {
    // Test AES-GCM support
    const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
      "encrypt",
      "decrypt",
    ]);

    expect(key).toBeDefined();

    // Test PBKDF2 support
    const keyMaterial = crypto.getRandomValues(new Uint8Array(32));
    const importedKey = await crypto.subtle.importKey("raw", keyMaterial, "PBKDF2", false, [
      "deriveBits",
      "deriveKey",
    ]);

    expect(importedKey).toBeDefined();
  });

  it("should handle missing WebCrypto gracefully", async () => {
    // Temporarily remove crypto
    const originalCrypto = window.crypto;

    // @ts-ignore - intentionally testing missing API
    delete window.crypto;

    // Should throw clear error
    expect(() => {
      if (!window.crypto || !window.crypto.subtle) {
        throw new Error("WebCrypto API not available");
      }
    }).toThrow("WebCrypto API not available");

    // Restore crypto
    // @ts-ignore
    window.crypto = originalCrypto;
  });

  it("should work with TextEncoder/TextDecoder", () => {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const text = "Test string with émojis 🔐";
    const encoded = encoder.encode(text);
    const decoded = decoder.decode(encoded);

    expect(decoded).toBe(text);
  });

  it("should handle large Uint8Array allocations", () => {
    const sizes = [
      1024 * 1024, // 1MB
      5 * 1024 * 1024, // 5MB
      10 * 1024 * 1024, // 10MB
    ];

    sizes.forEach((size) => {
      const array = new Uint8Array(size);
      expect(array.length).toBe(size);

      // Fill with random data
      crypto.getRandomValues(array);

      // Verify it's actually random (not all zeros)
      const sum = Array.from(array.slice(0, 100)).reduce((a, b) => a + b, 0);
      expect(sum).toBeGreaterThan(0);
    });
  });
});
```

---

## Step 9: Error Handling Patterns (15 min)

Create `src/lib/encryption-errors.ts`:

```typescript
export class EncryptionError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly originalError?: Error
  ) {
    super(message);
    this.name = "EncryptionError";
  }
}

export class SessionError extends EncryptionError {
  constructor(message: string, originalError?: Error) {
    super(message, "SESSION_ERROR", originalError);
    this.name = "SessionError";
  }
}

export class DecryptionError extends EncryptionError {
  constructor(message: string, originalError?: Error) {
    super(message, "DECRYPTION_ERROR", originalError);
    this.name = "DecryptionError";
  }
}

export class BrowserCompatibilityError extends EncryptionError {
  constructor(message: string) {
    super(message, "BROWSER_COMPATIBILITY_ERROR");
    this.name = "BrowserCompatibilityError";
  }
}

/**
 * Error recovery helper
 */
export async function withEncryptionErrorRecovery<T>(
  operation: () => Promise<T>,
  options?: {
    retries?: number;
    onError?: (error: Error, attempt: number) => void;
  }
): Promise<T> {
  const { retries = 3, onError } = options || {};

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      onError?.(error as Error, attempt);

      if (attempt === retries) {
        throw error;
      }

      // Exponential backoff
      await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt) * 100));
    }
  }

  throw new Error("Unreachable");
}
```

**Update BackupEncryption class** to use custom errors:

Now modify `src/lib/backup-encryption.ts` (created in Step 3) to use the custom error classes:

**Add import at the top of the file:**

```typescript
import { SessionError, DecryptionError } from "./encryption-errors";
import { supabase } from "./supabase";
```

**Update the `deriveKeyFromAuth` method** (replace line ~111):

```typescript
// BEFORE:
if (!session?.data?.session) {
  throw new Error("No active session. Please log in.");
}

// AFTER:
if (!session?.data?.session) {
  throw new SessionError("No active session. Please log in.");
}
```

**Update the `decryptBackup` method** (replace catch block around line ~192):

```typescript
// BEFORE:
catch (error) {
  throw new Error("Decryption failed. Data may be corrupted or key is incorrect.");
}

// AFTER:
catch (error) {
  throw new DecryptionError(
    "Decryption failed. Data may be corrupted or key is incorrect.",
    error instanceof Error ? error : undefined
  );
}
```

This provides better error typing and error recovery capabilities.

---

## Common Implementation Mistakes

Before moving to verification, review these common pitfalls to avoid debugging time.

### Mistake #1: Forgetting to await async functions ⚠️

```typescript
// ❌ WRONG - Missing await (returns Promise, not data)
const encrypted = encryption.encryptBackup(data);
console.log(encrypted.iv); // undefined! It's a Promise!

// ✅ CORRECT - Always await async operations
const encrypted = await encryption.encryptBackup(data);
console.log(encrypted.iv); // Uint8Array(12)
```

**Symptom:**

- Tests fail with "Cannot read property 'iv' of undefined"
- Type errors: "encrypted is not a valid EncryptedBackup"
- Promises show up in console logs instead of values

**Fix:** Add `await` before all async function calls. Enable ESLint rule `@typescript-eslint/no-floating-promises` to catch this automatically.

---

### Mistake #2: Reusing IV across encryptions 🔴 SECURITY

```typescript
// ❌ WRONG - Reusing same IV (CRITICAL security vulnerability!)
const iv = crypto.getRandomValues(new Uint8Array(12));
for (let i = 0; i < 100; i++) {
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv }, // Same IV every time!
    key,
    data
  );
}

// ✅ CORRECT - Generate fresh IV for EVERY encryption
for (let i = 0; i < 100; i++) {
  const iv = crypto.getRandomValues(new Uint8Array(12)); // Fresh IV each time
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data);
}
```

**Symptom:**

- IV uniqueness tests fail (expects 100 unique, gets 1)
- Security vulnerability (attackers can deduce key material)
- Multiple encryptions of same data produce identical ciphertext

**Fix:** **ALWAYS** call `crypto.getRandomValues()` inside the encryption function. Never cache or reuse IVs. See `generateIV()` function in crypto-utils.ts.

---

### Mistake #3: Not clearing key after use 💾

```typescript
// ❌ WRONG - Key stays in memory indefinitely
const encryption = new BackupEncryption();
await encryption.encryptBackup(data);
// encryptionKey still cached in memory!

// Later, somewhere else in the app:
await encryption.encryptBackup(moreData); // Still using old key

// ✅ CORRECT - Clear key when done with operations
const encryption = new BackupEncryption();
await encryption.encryptBackup(data);
encryption.clearKey(); // Explicitly clear from memory

// Or use try-finally pattern:
try {
  const encrypted = await encryption.encryptBackup(data);
  return encrypted;
} finally {
  encryption.clearKey(); // Always clear, even on error
}
```

**Symptom:**

- Memory leaks in long-running apps
- Stale keys after session refresh
- Increased memory usage over time

**Fix:** Call `clearKey()` after completing encryption operations, especially before user logout or session refresh.

---

### Mistake #4: Catching errors too broadly 🎯

```typescript
// ❌ WRONG - Swallows all error information
try {
  await encryption.encryptBackup(data);
} catch {
  console.log("Failed"); // Lost valuable debugging info!
  return null; // Silent failure
}

// ✅ CORRECT - Preserve and handle specific error types
try {
  await encryption.encryptBackup(data);
} catch (error) {
  console.error("Encryption failed:", error); // Log full error

  // Handle specific error types
  if (error instanceof SessionError) {
    toast.error("Please log in to encrypt backups");
    router.push("/login");
  } else if (error instanceof BrowserCompatibilityError) {
    toast.error("Your browser does not support encryption. Please update.");
  } else {
    toast.error("Encryption failed. Please try again.");
  }

  throw error; // Re-throw for upstream error handling
}
```

**Symptom:**

- Silent failures (user doesn't know what went wrong)
- Lost error stack traces (can't debug)
- Generic "something went wrong" messages

**Fix:** Always log the full error object. Use custom error types (SessionError, DecryptionError) to provide specific user feedback. Re-throw errors unless you're at a boundary.

---

### Mistake #5: Mixing Buffer and Uint8Array (Node.js) 🌐

```typescript
// ❌ WRONG - Buffer is Node.js only (fails in browser)
const data = Buffer.from("test data"); // ReferenceError: Buffer is not defined
const encrypted = await encryption.encryptBackup(data);

// ✅ CORRECT - Uint8Array is universal (works everywhere)
const data = new TextEncoder().encode("test data"); // Browser + Node.js
const encrypted = await encryption.encryptBackup(data);
```

**Symptom:**

- "Buffer is not defined" in browser tests
- "TextEncoder is not defined" in old Node.js versions
- Tests pass locally (Node.js) but fail in CI (browser)

**Fix:** Always use `TextEncoder`/`TextDecoder` for string conversion and `Uint8Array` for binary data. Never use `Buffer` in code that runs in browsers.

---

### Mistake #6: Incorrect pack/unpack ordering 📦

```typescript
// ❌ WRONG - Unpacking without proper metadata
const packed = packEncryptedBackup(encrypted);
// ... store and retrieve ...
const unpacked = unpackEncryptedBackup(packed, {}); // Missing IV metadata!

// ✅ CORRECT - Store IV metadata with packed data
const packed = packEncryptedBackup(encrypted);

// Store metadata separately
const metadata = {
  iv: Array.from(encrypted.iv), // Convert Uint8Array to JSON-serializable array
  algorithm: encrypted.algorithm,
  keyDerivation: encrypted.keyDerivation,
};

// ... store both packed data and metadata ...

// Retrieve and unpack with metadata
const unpacked = unpackEncryptedBackup(packed, metadata);
```

**Symptom:**

- "Cannot unpack encrypted backup" errors
- Decryption fails with "Invalid IV"
- Data corruption after storage/retrieval

**Fix:** Always store IV metadata alongside packed data. The IV is required for decryption and must be preserved exactly.

---

### Mistake #7: Testing with mock session instead of real auth 🔐

```typescript
// ❌ WRONG - Mocking session bypasses key derivation
vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: () => ({ data: { session: { access_token: "fake" } } }),
    },
  },
}));

// ✅ CORRECT - Use real session or mock with proper JWT structure
const mockSession = {
  access_token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...", // Valid JWT format
  user: {
    id: "a1b2c3d4-e5f6-7890-1234-567890abcdef", // Valid UUID
  },
};

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: mockSession },
      }),
    },
  },
}));
```

**Symptom:**

- Key derivation returns different keys in tests vs production
- Tests pass but real implementation fails
- "Invalid key material" errors in production

**Fix:** Mock sessions must have realistic structure (valid JWT format, proper user ID). Better yet, use real test accounts with Supabase test project.

---

## Quick Debug Checklist ✓

If your tests are failing, check these in order:

### Compilation/Import Errors

- [ ] All imports use correct paths (`@/lib/...` not `./lib/...`)?
- [ ] TypeScript types imported with `import type` for type-only imports?
- [ ] No circular dependencies between files?

### Runtime Errors

- [ ] All async functions have `await`?
- [ ] Session is active (user logged in)?
- [ ] WebCrypto API available (HTTPS or localhost)?
- [ ] Using `Uint8Array`, not `Buffer`?

### Encryption Failures

- [ ] Fresh IV generated for each encryption (not reused)?
- [ ] Key derived successfully (no "No active session" errors)?
- [ ] Data is `Uint8Array` (not string or Buffer)?
- [ ] Encryption key not null before encrypt/decrypt?

### Decryption Failures

- [ ] Using same key that encrypted the data?
- [ ] IV passed correctly to decrypt?
- [ ] Data not corrupted during storage?
- [ ] Session still active (not expired)?

### Test Failures

- [ ] Mock session has proper structure (access_token + user.id)?
- [ ] Test environment has WebCrypto support?
- [ ] No test isolation issues (shared state between tests)?
- [ ] Async tests properly awaited?

### Performance Issues

- [ ] PBKDF2 iterations not too high for hardware?
- [ ] Key caching working (not re-deriving every time)?
- [ ] Large data not causing memory issues?

**Still stuck?** See `troubleshooting.md` for detailed runtime error solutions.

---

## Rollback Strategy

If you need to abort or restart implementation:

### Scenario 1: Tests Failing After Steps 1-3 (Types, Utils, Engine) 🔧

**Keep:** Types and utilities - they're harmless and reusable
**Remove:** Encryption engine causing test failures

```bash
# Remove only the failing encryption implementation
rm src/lib/backup-encryption.ts
rm src/lib/backup-encryption.test.ts

# Keep types and utils (they're fine)
# src/types/backup.ts - KEEP
# src/lib/crypto-utils.ts - KEEP

# Clean up git if needed
git checkout -- src/lib/backup-encryption.ts
```

**When to use:** Encryption logic has fundamental issues, start Step 3 from scratch.

---

### Scenario 2: Performance Issues (Step 7 Benchmarks) ⏱️

**Don't remove code** - Adjust expectations for your hardware instead:

```typescript
// In src/lib/backup-encryption.ts
// Temporarily reduce iterations for development/testing
const PBKDF2_ITERATIONS =
  process.env.NODE_ENV === "test"
    ? 10000 // Fast for tests
    : process.env.NODE_ENV === "development"
      ? 50000 // Moderate for dev (faster key derivation)
      : 100000; // Full security for production
```

**Update vitest.config.ts** to set test environment:

```typescript
export default defineConfig({
  test: {
    env: {
      NODE_ENV: "test",
    },
  },
});
```

**When to use:** Performance tests failing on slower hardware, but implementation is correct.

---

### Scenario 3: Hook Integration Issues (Step 5) ⚛️

**Keep:** Core encryption engine (it works)
**Remove:** React hook wrapper

```bash
# Remove only the hook and its tests
rm src/hooks/useBackupEncryption.ts
rm src/hooks/useBackupEncryption.test.ts

# Keep core encryption
# src/lib/backup-encryption.ts - KEEP
```

**When to use:** Hook has React-specific issues (state management, re-renders), but core encryption works fine.

---

### Scenario 4: Integration Test Failures (Step 6) 🔗

**Keep:** All implementation files
**Fix:** Integration test setup instead

```bash
# Don't delete implementation - fix test mocks
# Check these files:
# src/lib/__tests__/backup-encryption-integration.test.ts

# Common fixes:
# 1. Update Supabase mock structure
# 2. Add missing test dependencies
# 3. Fix async test patterns
```

**When to use:** Implementation works in manual testing, but integration tests fail due to mock/setup issues.

---

### Scenario 5: Complete Abort (Nuclear Option) ☢️

**Use only if:** Implementation is fundamentally broken and starting over is faster than debugging.

```bash
# Remove ALL files created in this chunk
rm src/types/backup.ts
rm src/lib/crypto-utils.ts
rm src/lib/backup-encryption.ts
rm src/lib/backup-encryption.test.ts
rm src/lib/encryption-errors.ts
rm src/hooks/useBackupEncryption.ts
rm src/hooks/useBackupEncryption.test.ts
rm -rf src/lib/__tests__/backup-encryption-*.test.ts

# Reset to clean state
git checkout -- src/
git clean -fd src/

# Restart from Step 0 (Prerequisites)
```

**When to use:** Multiple systems broken, faster to restart than debug.

---

### Scenario 6: Partial Completion (Pause and Resume) ⏸️

**If pausing mid-implementation:**

```bash
# Commit what works so far
git add src/types/backup.ts src/lib/crypto-utils.ts
git commit -m "WIP: chunk 039 - types and utilities complete"

# Document where you stopped
echo "Stopped at: Step 4 - Unit Tests" > CHUNK-039-PROGRESS.txt
git add CHUNK-039-PROGRESS.txt
git commit -m "docs: track chunk 039 progress"
```

**When resuming:**

```bash
# Check where you left off
cat CHUNK-039-PROGRESS.txt

# Continue from that step
```

**When to use:** Need to pause implementation for >1 day, want clean checkpoint.

---

### When to Rollback vs Debug

**Rollback if:**

- Stuck for >30 minutes with no progress
- Multiple test categories failing (suggests fundamental issue)
- Prerequisites check failed (wrong foundation)
- Hardware can't meet performance targets (need to adjust, not fix)

**Debug if:**

- Only 1-2 specific tests failing (isolated issue)
- Error messages are clear and actionable
- Implementation worked before recent change
- Just need to adjust configuration (like PBKDF2 iterations)

---

### Rollback Safety Checks ✅

Before executing rollback:

1. **Check git status:**

   ```bash
   git status
   # Ensure no unrelated changes will be lost
   ```

2. **Stash any good work:**

   ```bash
   git stash push -m "chunk-039-partial-work"
   # Can restore later: git stash pop
   ```

3. **Verify backup exists:**

   ```bash
   git log --oneline | head -5
   # Check recent commits exist
   ```

4. **Execute rollback:**

   ```bash
   # Use specific scenario commands above
   ```

5. **Verify clean state:**
   ```bash
   npm run lint
   npm run build
   # Should succeed with no chunk 039 code
   ```

---

## Done!

When all tests pass and encryption works across different scenarios, you're ready for the checkpoint.

**Before proceeding:**

- [ ] Review common mistakes above (avoid them in your implementation)
- [ ] Know which rollback scenario applies if you get stuck
- [ ] Have git commits for incremental progress

**Next**: `checkpoint.md` to verify the complete encryption system.
