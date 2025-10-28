import { describe, it, expect } from "vitest";
import { idempotencyGenerator } from "./idempotency";

describe("IdempotencyKeyGenerator", () => {
  describe("generateKey", () => {
    it("should generate deterministic keys", () => {
      const key1 = idempotencyGenerator.generateKey("device-abc", "transaction", "tx-123", 1);

      const key2 = idempotencyGenerator.generateKey("device-abc", "transaction", "tx-123", 1);

      expect(key1).toBe(key2);
      expect(key1).toBe("device-abc-transaction-tx-123-1");
    });

    it("should generate unique keys for different inputs", () => {
      const key1 = idempotencyGenerator.generateKey("device-abc", "transaction", "tx-123", 1);

      const key2 = idempotencyGenerator.generateKey("device-abc", "transaction", "tx-123", 2);

      const key3 = idempotencyGenerator.generateKey("device-xyz", "transaction", "tx-123", 1);

      expect(key1).not.toBe(key2); // Different lamport clock
      expect(key1).not.toBe(key3); // Different device
    });

    it("should handle special characters", () => {
      const key = idempotencyGenerator.generateKey(
        "device-abc",
        "transaction",
        "tx-with-dashes-123",
        1
      );

      expect(key).toBe("device-abc-transaction-tx-with-dashes-123-1");
    });
  });

  describe("calculateChecksum", () => {
    it("should generate consistent checksums", async () => {
      const payload = { amount: 1000, description: "Test" };

      const checksum1 = await idempotencyGenerator.calculateChecksum(payload);
      const checksum2 = await idempotencyGenerator.calculateChecksum(payload);

      expect(checksum1).toBe(checksum2);
      expect(checksum1).toHaveLength(64); // SHA-256 is 64 hex chars
    });

    it("should ignore key order", async () => {
      const payload1 = { amount: 1000, description: "Test" };
      const payload2 = { description: "Test", amount: 1000 }; // Different order

      const checksum1 = await idempotencyGenerator.calculateChecksum(payload1);
      const checksum2 = await idempotencyGenerator.calculateChecksum(payload2);

      expect(checksum1).toBe(checksum2);
    });

    it("should ignore timestamps", async () => {
      const payload1 = { amount: 1000, created_at: "2024-01-01", updated_at: "2024-01-02" };

      const payload2 = { amount: 1000, created_at: "2024-02-01", updated_at: "2024-02-02" };

      const checksum1 = await idempotencyGenerator.calculateChecksum(payload1);
      const checksum2 = await idempotencyGenerator.calculateChecksum(payload2);

      expect(checksum1).toBe(checksum2);
    });

    it("should detect payload changes", async () => {
      const payload1 = { amount: 1000 };
      const payload2 = { amount: 2000 };

      const checksum1 = await idempotencyGenerator.calculateChecksum(payload1);
      const checksum2 = await idempotencyGenerator.calculateChecksum(payload2);

      expect(checksum1).not.toBe(checksum2);
    });
  });
});
