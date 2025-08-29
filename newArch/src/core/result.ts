import type { Result, Success, Failure } from '../types/result'

// PURE: Result constructors
export function success<T>(value: T): Success<T> {
  return { kind: 'success', value }
}

export function failure<E>(error: E): Failure<E> {
  return { kind: 'failure', error }
}

// PURE: Monad operations
export function map<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => U
): Result<U, E> {
  return isSuccess(result) ? success(fn(result.value)) : result
}

export function flatMap<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => Result<U, E>
): Result<U, E> {
  return isSuccess(result) ? fn(result.value) : result
}

export async function flatMapAsync<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => Promise<Result<U, E>>
): Promise<Result<U, E>> {
  return isSuccess(result) ? fn(result.value) : result
}

// Type guards (could also go in utils/guards.ts)
export function isSuccess<T, E>(result: Result<T, E>): result is Success<T> {
  return result.kind === 'success'
}

export function isFailure<T, E>(result: Result<T, E>): result is Failure<E> {
  return result.kind === 'failure'
}