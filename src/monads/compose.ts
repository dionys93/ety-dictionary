// src/monads/compose.ts

/**
 * Utility functions for function composition and pipeline building
 * Works seamlessly with monads and regular functions
 */

/**
 * Composes two functions from right to left
 * @param f - Function to apply second
 * @param g - Function to apply first
 * @returns Composed function that applies g then f
 */
export const compose = <A, B, C>(
  f: (b: B) => C, 
  g: (a: A) => B
) => (a: A): C => f(g(a));

/**
 * Pipes a value through multiple functions from left to right
 * More intuitive than compose for reading data flow
 * @param fns - Array of functions to apply in sequence
 * @returns Function that takes initial value and pipes it through all functions
 */
export const pipe = <T>(...fns: Array<(arg: T) => T>) => 
  (value: T): T => fns.reduce((acc, fn) => fn(acc), value);

/**
 * Creates a pipeline that can handle different types at each step
 * More flexible than pipe for complex transformations
 * @param value - Initial value
 * @param fns - Functions to apply in sequence
 * @returns Final transformed value
 */
export const pipeline = <T>(value: T, ...fns: Array<(arg: any) => any>): any => 
  fns.reduce((acc, fn) => fn(acc), value);

/**
 * Curried version of pipe for partial application
 * Useful for creating reusable transformation pipelines
 * @param fns - Functions to include in the pipeline
 * @returns Function that takes a value and applies all transformations
 */
export const createPipeline = <T>(...fns: Array<(arg: T) => T>) => 
  (value: T): T => pipe(...fns)(value);

/**
 * Composes multiple functions that take the same input type
 * Useful for applying multiple transformations in parallel
 * @param fns - Functions to compose
 * @returns Function that applies all functions and returns array of results
 */
export const parallel = <T, U>(
  ...fns: Array<(arg: T) => U>
) => (value: T): U[] => fns.map(fn => fn(value));

/**
 * Creates a conditional pipeline branch
 * Applies different transformations based on a predicate
 * @param predicate - Function to test the value
 * @param onTrue - Function to apply if predicate is true
 * @param onFalse - Function to apply if predicate is false
 * @returns Function that applies conditional transformation
 */
export const branch = <T>(
  predicate: (value: T) => boolean,
  onTrue: (value: T) => T,
  onFalse: (value: T) => T
) => (value: T): T => predicate(value) ? onTrue(value) : onFalse(value);

/**
 * Creates a safe version of a function that might throw
 * Wraps the function to return a Result instead of throwing
 * @param fn - Function that might throw an error
 * @returns Function that returns Result instead of throwing
 */
export const safe = <T, U>(fn: (arg: T) => U) => 
  (arg: T): import('./result').Result<U> => {
    try {
      return { isSuccess: true, value: fn(arg), error: undefined };
    } catch (error) {
      return { 
        isSuccess: false, 
        value: undefined, 
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  };

/**
 * Retries a function multiple times if it fails
 * Useful for operations that might fail intermittently
 * @param times - Number of times to retry
 * @param fn - Function to retry
 * @returns Function that retries the operation
 */
export const retry = <T, U>(times: number, fn: (arg: T) => U) => 
  (arg: T): U => {
    const maxAttempts = Math.max(1, times);
    const errors: Error[] = [];
    
    for (const attempt of Array(maxAttempts).keys()) {
      try {
        return fn(arg);
      } catch (error) {
        errors.push(error instanceof Error ? error : new Error(String(error)));
        if (attempt === maxAttempts - 1) {
          throw new Error(`Failed after ${maxAttempts} attempts: ${errors.map(e => e.message).join(', ')}`);
        }
      }
    }
    
    // This should never be reached, but TypeScript requires it
    throw new Error('Unexpected error in retry function');
  };

/**
 * Memoizes a function to cache results
 * Useful for expensive computations with repeated inputs
 * @param fn - Function to memoize
 * @returns Memoized version of the function
 */
export const memoize = <T, U>(fn: (arg: T) => U): (arg: T) => U => {
  const cache = new Map<T, U>();
  
  return (arg: T): U => {
    if (cache.has(arg)) {
      return cache.get(arg)!;
    }
    
    const result = fn(arg);
    cache.set(arg, result);
    return result;
  };
};