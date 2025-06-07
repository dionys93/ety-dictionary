// src/pipelines/text-json-pipeline.ts
// Composable pipeline for TEXT => JSON transformation

import { Result, ok, err, flatMap, map } from '../monads'
import { RawText } from '../types/text'

export interface TextToJSONPipeline<T> {
  readonly name: string
  readonly steps: readonly PipelineStep<any, any>[]
  readonly run: (input: RawText) => Result<T>
}

export interface PipelineStep<I, O> {
  readonly name: string
  readonly transform: (input: I) => Result<O>
  readonly canSkip?: boolean
}

export const createPipeline = <T>(
  name: string,
  steps: readonly PipelineStep<any, any>[]
): TextToJSONPipeline<T> => {
  const run = (input: RawText): Result<T> => {
    // Compose all steps using flatMap
    const composition = steps.reduce(
      (acc, step) => flatMap(step.transform),
      ok as (x: any) => Result<any>
    )
    
    return composition(input) as Result<T>
  }
  
  return { name, steps, run }
}

// Builder pattern for fluent pipeline construction
export class PipelineBuilder<I, O> {
  private steps: PipelineStep<any, any>[] = []
  
  constructor(private name: string) {}
  
  addStep<N>(
    stepName: string, 
    transform: (input: O) => Result<N>
  ): PipelineBuilder<I, N> {
    this.steps.push({ name: stepName, transform })
    return this as any
  }
  
  addOptionalStep<N>(
    stepName: string,
    transform: (input: O) => Result<N>,
    condition: (input: O) => boolean
  ): PipelineBuilder<I, N> {
    const conditionalTransform = (input: O) => 
      condition(input) ? transform(input) : ok(input as any)
    
    this.steps.push({ 
      name: stepName, 
      transform: conditionalTransform,
      canSkip: true
    })
    return this as any
  }
  
  build(): TextToJSONPipeline<O> {
    return createPipeline(this.name, this.steps)
  }
}