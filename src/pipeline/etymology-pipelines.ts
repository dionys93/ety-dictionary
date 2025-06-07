// src/pipelines/etymology-pipelines.ts
// Concrete pipeline implementations

import { PipelineBuilder } from './text-json-pipeline'
import { textToLines, groupIntoBlocks } from '../transformations/text-to-lines'
import { parseEtymologyBlock } from '../transformations/parse-etymology'
import { formatAsStandardJSON, formatAsCompactJSON } from '../transformations/json-formatters'

export const createStandardEtymologyPipeline = () =>
  new PipelineBuilder<RawText, EtymologyJSON>('standard-etymology')
    .addStep('text-to-lines', textToLines)
    .addStep('group-into-blocks', groupIntoBlocks)
    .addStep('parse-blocks', parseEtymologyBlock)
    .addStep('format-json', formatAsStandardJSON)
    .build()

export const createCompactEtymologyPipeline = () =>
  new PipelineBuilder<RawText, CompactJSON>('compact-etymology')
    .addStep('text-to-lines', textToLines)
    .addStep('group-into-blocks', groupIntoBlocks)
    .addStep('parse-blocks', parseEtymologyBlock)
    .addStep('format-compact', formatAsCompactJSON)
    .build()

// Pipeline with conditional steps
export const createSmartEtymologyPipeline = () =>
  new PipelineBuilder<RawText, EtymologyJSON>('smart-etymology')
    .addStep('text-to-lines', textToLines)
    .addOptionalStep(
      'clean-special-chars',
      cleanSpecialCharacters,
      (lines) => lines.some(l => l.content.includes('ꬻ'))
    )
    .addStep('group-into-blocks', groupIntoBlocks)
    .addStep('parse-blocks', parseEtymologyBlock)
    .addStep('format-json', formatAsStandardJSON)
    .build()