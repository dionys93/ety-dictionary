// src/pipeline/pipeline-visualizer.ts
import { TextProcessingPipeline } from '../types/pipeline-types'

export const visualizePipeline = (pipeline: TextProcessingPipeline, name: string): string => {
  const steps = [
    `TEXT`,
    `→ ${pipeline.textTransform.name || 'transform'}`,
    `→ ${pipeline.lineParser.name || 'parse'}`,
    `→ ${pipeline.entryGrouper.name || 'group'}`,
    `→ ${pipeline.wordNameExtractor.name || 'extract'}`,
    `→ ${pipeline.entryTransformer.name || 'format'}`
  ]
  
  if (Object.keys(pipeline.customTransformers).length > 0) {
    steps.push(`→ {${Object.keys(pipeline.customTransformers).join(', ')}}`)
  }
  
  steps.push(`→ JSON`)
  
  return `${name}: ${steps.join(' ')}`
}

// Usage in main.ts:
// console.log(visualizePipeline(pipelines.standard, 'standard'))
// Output: "standard: TEXT → transform → parse → group → extract → format → JSON"