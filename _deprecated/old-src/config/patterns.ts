// src/config/patterns.ts
// Common regex patterns used throughout the text processing pipeline

/**
 * Pattern to match word characters including extended Latin characters
 * Matches letters, digits, underscore, and extended Latin characters
 */
export const WORD_PATTERN = /^([\w\u00C0-\u024F\u1E00-\u1EFF]+)/i

/**
 * Pattern to match any language tag in square brackets
 * Global flag for replacing all occurrences
 */
export const LANGUAGE_TAG_PATTERN = /\[[A-Z]+\]/g

/**
 * Pattern to capture a specific language tag
 * Captures the language code inside brackets
 */
export const SPECIFIC_LANGUAGE_TAG_PATTERN = /\[([A-Z]+)\]/

/**
 * Pattern to match part of speech in parentheses at end of line
 * Captures the content inside the parentheses
 */
export const POS_PATTERN = /\(([^)]+)\)\s*$/

/**
 * Pattern to match infinitive "to" at the beginning of a phrase
 */
export const INFINITIVE_PATTERN = /^to\s+/i

/**
 * Pattern to match ME or MI language tags specifically
 */
export const ME_MI_PATTERN = /\[M[EI]\]/

/**
 * Pattern to match a POS indicator anywhere in a line
 * Non-capturing group for checking presence
 */
export const POS_ANYWHERE_PATTERN = /\s*\([^)]+\)\s*$/

/**
 * Common patterns exported as a frozen object
 */
export const PATTERNS = Object.freeze({
  WORD: WORD_PATTERN,
  LANGUAGE_TAG: LANGUAGE_TAG_PATTERN,
  SPECIFIC_LANGUAGE_TAG: SPECIFIC_LANGUAGE_TAG_PATTERN,
  POS: POS_PATTERN,
  INFINITIVE: INFINITIVE_PATTERN,
  ME_MI: ME_MI_PATTERN,
  POS_ANYWHERE: POS_ANYWHERE_PATTERN
})