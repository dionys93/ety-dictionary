// src/monads/index.ts

/**
 * Main exports for the monads module
 * Provides functional programming utilities for safe data transformation
 */

// Result monad for error handling
export * from './result';

// Maybe monad for nullable values - with explicit re-exports to avoid conflicts
export {
  some,
  none,
  maybeOf,
  maybeMap,
  maybeFlatMap,
  getOrElseLazy,
  isSome,
  isNone,
  maybeFilter,
  maybeToArray,
  findFirst,
  collectSomes
} from './maybe';

// Export Maybe's getOrElse with a different name to avoid conflict
export { getOrElse as maybeGetOrElse } from './maybe';

// Re-export types for convenience
export type { Result } from './result';
export type { Maybe } from './maybe';