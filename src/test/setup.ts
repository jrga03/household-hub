/**
 * Test setup file for Vitest
 * Configures browser-like environment for IndexedDB and localStorage tests
 */

import { afterEach, vi } from "vitest";
import "fake-indexeddb/auto";

// Mock matchMedia for PWA platform detection
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {}, // deprecated
    removeListener: () => {}, // deprecated
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

// Mock navigator.storage for storage quota tests
Object.defineProperty(navigator, "storage", {
  writable: true,
  value: {
    estimate: vi.fn().mockResolvedValue({
      usage: 1024 * 1024 * 10, // 10MB used
      quota: 1024 * 1024 * 1024, // 1GB quota
      usageDetails: {
        indexedDB: 1024 * 1024 * 10,
      },
    }),
    persist: vi.fn().mockResolvedValue(true),
    persisted: vi.fn().mockResolvedValue(false),
  },
});

// Mock dispatchEvent for Dexie live queries
if (typeof globalThis.dispatchEvent === "undefined") {
  globalThis.dispatchEvent = vi.fn() as typeof globalThis.dispatchEvent;
}

// Mock performance API if not available
if (typeof globalThis.performance === "undefined") {
  globalThis.performance = {
    now: vi.fn(() => Date.now()),
    mark: vi.fn(),
    measure: vi.fn(),
    clearMarks: vi.fn(),
    clearMeasures: vi.fn(),
    getEntries: vi.fn(() => []),
    getEntriesByName: vi.fn(() => []),
    getEntriesByType: vi.fn(() => []),
    toJSON: vi.fn(),
    timeOrigin: Date.now(),
  } as Performance;
}

// Clean up after each test
afterEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});
