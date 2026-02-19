/**
 * Bank Parser Profile Registry
 *
 * Central registry of all bank-specific PDF statement parsers.
 * New parsers are registered by adding them to PARSER_REGISTRY.
 *
 * Usage:
 * - getParser(id) — lookup a specific parser
 * - detectParser(text) — auto-detect bank from first page text
 * - PARSER_REGISTRY — iterate all available parsers for UI dropdowns
 *
 * @module pdf-parsers/index
 */

import type { BankParserProfile } from "@/types/pdf-import";
import { bdoCreditCardParser } from "./bdo-credit-card";

/**
 * All registered bank parser profiles.
 * Add new parsers here as they are implemented.
 */
export const PARSER_REGISTRY: BankParserProfile[] = [bdoCreditCardParser];

/**
 * Look up a parser by its ID.
 */
export function getParser(id: string): BankParserProfile | undefined {
  return PARSER_REGISTRY.find((p) => p.id === id);
}

/**
 * Auto-detect which parser to use based on the first page's text content.
 * Returns the first parser whose detect() heuristic matches.
 */
export function detectParser(firstPageText: string): BankParserProfile | undefined {
  return PARSER_REGISTRY.find((p) => p.detect?.(firstPageText));
}
