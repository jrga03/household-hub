/**
 * Test setup file for Vitest
 * Configures browser-like environment for IndexedDB and localStorage tests
 */

import { afterEach } from "vitest";
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

// Clean up after each test
afterEach(() => {
  localStorage.clear();
});
