// src/monads/result.ts

/**
 * Result type for handling success/failure states
 * Provides a safe way to handle operations that might fail
 */
export type Result<T, E = Error> = {
  readonly isSuccess: boolean;
  readonly value?: T;
  readonly error?: E;
}

/**
 * Creates a successful Result containing a value
 * @param value - The successful value to wrap
 * @returns Result in success state
 */
export const ok = <T>(value: T): Result<T> => ({
  isSuccess: true,
  value,
  error: undefined
});

/**
 * Creates a failed Result containing an error
 * @param error - The error to wrap
 * @returns Result in error state
 */
export const err = <E>(error: E): Result<never, E> => ({
  isSuccess: false,
  value: undefined,
  error
});

/**
 * Maps a function over the value inside a Result
 * Only applies the function if the Result is successful
 * @param fn - Function to apply to the successful value
 * @returns Function that takes a Result and returns a new Result
 */
export const map = <T, U, E>(fn: (value: T) => U) => 
  (result: Result<T, E>): Result<U, E> => 
    result.isSuccess 
      ? { isSuccess: true, value: fn(result.value!), error: undefined } as Result<U, E>
      : { isSuccess: false, value: undefined, error: result.error! } as Result<U, E>;

/**
 * Chains operations that return Results
 * Flattens nested Results to avoid Result<Result<T>>
 * @param fn - Function that takes a value and returns a Result
 * @returns Function that takes a Result and returns a flattened Result
 */
export const flatMap = <T, U, E>(fn: (value: T) => Result<U, E>) => 
  (result: Result<T, E>): Result<U, E> => 
    result.isSuccess 
      ? fn(result.value!)
      : { isSuccess: false, value: undefined, error: result.error! } as Result<U, E>;

/**
 * Extracts the value from a Result by providing handlers for both cases
 * @param onError - Function to handle the error case
 * @param onSuccess - Function to handle the success case
 * @returns Function that takes a Result and returns the handled value
 */
export const fold = <T, U, E>(
  onError: (error: E) => U, 
  onSuccess: (value: T) => U
) => (result: Result<T, E>): U => 
  result.isSuccess ? onSuccess(result.value!) : onError(result.error!);

/**
 * Gets the value from a successful Result, or returns a fallback
 * @param fallback - Value to return if Result is in error state
 * @returns Function that takes a Result and returns the value or fallback
 */
export const getOrElse = <T, E = Error>(fallback: T) => 
  (result: Result<T, E>): T => 
    result.isSuccess ? result.value! : fallback;

/**
 * Checks if a Result is successful
 * @param result - The Result to check
 * @returns True if the Result contains a value
 */
export const isOk = <T, E>(result: Result<T, E>): boolean => result.isSuccess;

/**
 * Checks if a Result is an error
 * @param result - The Result to check
 * @returns True if the Result contains an error
 */
export const isErr = <T, E>(result: Result<T, E>): boolean => !result.isSuccess;

/**
 * Combines multiple Results into a single Result containing an array
 * If any Result is an error, returns the first error encountered
 * @param results - Array of Results to combine
 * @returns Result containing array of all values, or first error
 */
export const sequence = <T, E>(results: Result<T, E>[]): Result<T[], E> => {
  const values: T[] = [];
  
  for (const result of results) {
    if (result.isSuccess) {
      values.push(result.value!);
    } else {
      return { isSuccess: false, value: undefined, error: result.error! } as Result<T[], E>;
    }
  }
  
  return { isSuccess: true, value: values, error: undefined } as Result<T[], E>;
};

/**
 * Combines multiple Results, collecting all successful values
 * Ignores errors and returns only the successful values
 * @param results - Array of Results to filter
 * @returns Result containing array of successful values and array of errors
 */
export const filterSuccesses = <T, E>(results: Result<T, E>[]): { successes: T[], errors: E[] } => {
  const successes: T[] = [];
  const errors: E[] = [];
  
  for (const result of results) {
    if (result.isSuccess) {
      successes.push(result.value!);
    } else {
      errors.push(result.error!);
    }
  }
  
  return { successes, errors };
};