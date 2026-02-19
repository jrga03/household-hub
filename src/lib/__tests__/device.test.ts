import { describe, it, expect, beforeEach } from "vitest";
import { getDeviceId, clearDeviceId, hasDeviceId } from "../device";

describe("device identification", () => {
  beforeEach(() => {
    // localStorage is cleared in afterEach by setup.ts, but let's be explicit
    localStorage.removeItem("household_hub_device_id");
  });

  describe("getDeviceId", () => {
    it("generates a UUID on first call", async () => {
      const id = await getDeviceId();
      // UUID v4 format: 8-4-4-4-12 hex chars
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });

    it("returns the same ID on subsequent calls", async () => {
      const id1 = await getDeviceId();
      const id2 = await getDeviceId();
      expect(id1).toBe(id2);
    });

    it("stores the ID in localStorage", async () => {
      const id = await getDeviceId();
      const stored = localStorage.getItem("household_hub_device_id");
      expect(stored).toBe(id);
    });

    it("returns existing ID from localStorage", async () => {
      localStorage.setItem("household_hub_device_id", "pre-existing-id");
      const id = await getDeviceId();
      expect(id).toBe("pre-existing-id");
    });
  });

  describe("clearDeviceId", () => {
    it("removes the device ID from localStorage", async () => {
      await getDeviceId(); // Generate one first
      clearDeviceId();
      expect(localStorage.getItem("household_hub_device_id")).toBeNull();
    });
  });

  describe("hasDeviceId", () => {
    it("returns false when no ID exists", () => {
      expect(hasDeviceId()).toBe(false);
    });

    it("returns true when ID exists", async () => {
      await getDeviceId();
      expect(hasDeviceId()).toBe(true);
    });

    it("returns false after clearDeviceId", async () => {
      await getDeviceId();
      clearDeviceId();
      expect(hasDeviceId()).toBe(false);
    });
  });
});
