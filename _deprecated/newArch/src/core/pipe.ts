import type { Result } from '../types'
import { success, flatMapAsync } from './result'

// PURE (structurally): Composition utility
export function pipeAsync<T>(
  ...fns: Array<(arg: any) => Promise<Result<any, Error>>>
): (value: T) => Promise<Result<any, Error>> {
  return async function(value: T) {
    const runPipeline = async (
      result: Result<any, Error>, 
      remainingFns: Array<(arg: any) => Promise<Result<any, Error>>>
    ): Promise<Result<any, Error>> => {
      if (remainingFns.length === 0) return result
      const [nextFn, ...rest] = remainingFns
      const nextResult = await flatMapAsync(result, nextFn)
      return runPipeline(nextResult, rest)
    }
    
    return runPipeline(success(value), fns)
  }
}