// src/monads/maybe.ts

/**
 * Maybe type for handling nullable/optional values
 * Provides a safe way to work with values that might not exist
 */
export type Maybe<T> = {
  readonly hasValue: boolean;
  readonly value?: T;
}

/**
 * Creates a Maybe containing a value
 * @param value - The value to wrap
 * @returns Maybe in some state
 */
export const some = <T>(value: T): Maybe<T> => ({
  hasValue: true,
  value
});

/**
 * Creates an empty Maybe
 * @returns Maybe in none state
 */
export const none = <T>(): Maybe<T> => ({
  hasValue: false,
  value: undefined
});

/**
 * Creates a Maybe from a potentially null/undefined value
 * @param value - Value that might be null or undefined
 * @returns Some if value exists, None otherwise
 */
export const maybeOf = <T>(value: T | null | undefined): Maybe<T> => 
  value != null ? some(value) : none<T>();

/**
 * Maps a function over the value inside a Maybe
 * Only applies the function if the Maybe contains a value
 * @param fn - Function to apply to the contained value
 * @returns Function that takes a Maybe and returns a new Maybe
 */
export const maybeMap = <T, U>(fn: (value: T) => U) => 
  (maybe: Maybe<T>): Maybe<U> => 
    maybe.hasValue ? some(fn(maybe.value!)) : none<U>();

/**
 * Chains operations that return Maybes
 * Flattens nested Maybes to avoid Maybe<Maybe<T>>
 * @param fn - Function that takes a value and returns a Maybe
 * @returns Function that takes a Maybe and returns a flattened Maybe
 */
export const maybeFlatMap = <T, U>(fn: (value: T) => Maybe<U>) => 
  (maybe: Maybe<T>): Maybe<U> => 
    maybe.hasValue ? fn(maybe.value!) : none<U>();

/**
 * Gets the value from a Maybe, or returns a fallback
 * @param fallback - Value to return if Maybe is empty
 * @returns Function that takes a Maybe and returns the value or fallback
 */
export const getOrElse = <T>(fallback: T) => 
  (maybe: Maybe<T>): T => 
    maybe.hasValue ? maybe.value! : fallback;

/**
 * Gets the value from a Maybe, or computes a fallback lazily
 * @param fallbackFn - Function to compute fallback value
 * @returns Function that takes a Maybe and returns the value or computed fallback
 */
export const getOrElseLazy = <T>(fallbackFn: () => T) => 
  (maybe: Maybe<T>): T => 
    maybe.hasValue ? maybe.value! : fallbackFn();

/**
 * Checks if a Maybe contains a value
 * @param maybe - The Maybe to check
 * @returns True if the Maybe contains a value
 */
export const isSome = <T>(maybe: Maybe<T>): boolean => maybe.hasValue;

/**
 * Checks if a Maybe is empty
 * @param maybe - The Maybe to check
 * @returns True if the Maybe is empty
 */
export const isNone = <T>(maybe: Maybe<T>): boolean => !maybe.hasValue;

/**
 * Filters a Maybe based on a predicate
 * If the Maybe is empty or the predicate fails, returns None
 * @param predicate - Function to test the value
 * @returns Function that takes a Maybe and returns filtered Maybe
 */
export const maybeFilter = <T>(predicate: (value: T) => boolean) => 
  (maybe: Maybe<T>): Maybe<T> => 
    maybe.hasValue && predicate(maybe.value!) ? maybe : none<T>();

/**
 * Converts a Maybe to an array
 * Returns empty array for None, single-element array for Some
 * @param maybe - The Maybe to convert
 * @returns Array containing the value or empty array
 */
export const maybeToArray = <T>(maybe: Maybe<T>): T[] => 
  maybe.hasValue ? [maybe.value!] : [];

/**
 * Finds the first Some value in an array of Maybes
 * @param maybes - Array of Maybes to search
 * @returns First Some value found, or None if all are None
 */
export const findFirst = <T>(maybes: Maybe<T>[]): Maybe<T> => {
  for (const maybe of maybes) {
    if (maybe.hasValue) {
      return maybe;
    }
  }
  return none<T>();
};

/**
 * Collects all Some values from an array of Maybes
 * @param maybes - Array of Maybes to collect from
 * @returns Array containing all the Some values
 */
export const collectSomes = <T>(maybes: Maybe<T>[]): T[] => {
  const results: T[] = [];
  for (const maybe of maybes) {
    if (maybe.hasValue) {
      results.push(maybe.value!);
    }
  }
  return results;
};