// src/types/pipeline-types.ts
import { TextLine } from './text'

export interface ParsedLine {
  text: string;
  origin?: string;
  language?: string;
  partOfSpeech?: string[];
  isUrl?: boolean;
}

export interface EntryGroup {
  etymologyLines: ParsedLine[];
  sourceLines: ParsedLine[];
  wordName?: string;
}

export interface EtymologyEntry {
  name: string;
  origin: string;
  "part-of-speech"?: string[];
}

export interface WordEntry {
  name: string;
  etymology: EtymologyEntry[];
  sources: string[];
}

export type TextTransformer = (text: string) => string;
export type LineParser = (line: TextLine) => ParsedLine;
export type EntryGrouper = (lines: TextLine[]) => EntryGroup[];
export type WordNameExtractor = (group: EntryGroup, fallbackName: string) => string;
export type EntryTransformer = (group: EntryGroup, wordName: string) => WordEntry;
export type CustomTransformer = (group: EntryGroup) => any;

export interface TextProcessingPipeline {
  textTransform: TextTransformer;
  lineParser: LineParser;
  entryGrouper: EntryGrouper;
  wordNameExtractor: WordNameExtractor;
  entryTransformer: EntryTransformer;
  customTransformers: Record<string, CustomTransformer>;
}

// Add these to your existing pipeline-types.ts if needed
export interface VerbEntry extends WordEntry {
  conjugations?: {
    thirdPerson?: string
    pastTense?: string 
    progressive?: string
  }
}

export interface NounEntry extends WordEntry {
  gender?: 'masculine' | 'feminine' | 'neuter'
  number?: 'singular' | 'plural'
}

export interface AdjectiveEntry extends WordEntry {
  degrees?: {
    positive?: string
    comparative?: string  
    superlative?: string
  }
}