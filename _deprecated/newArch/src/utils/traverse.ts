import type { Result } from '../types/result'
import { success, isFailure } from '../core/result'

// PURE (structurally): Higher-order function
export async function traverse<T, U, E>(
  items: T[],
  fn: (item: T) => Promise<Result<U, E>>
): Promise<Result<U[], E>> {
  const results: U[] = []
  
  for (const item of items) {
    const result = await fn(item)
    if (isFailure(result)) {
      return result
    }
    results.push(result.value)
  }
  
  return success(results)
}