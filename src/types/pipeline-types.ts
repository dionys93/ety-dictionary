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

// NEW: Generic type parameters for pipelines
export type TextTransformer = (text: string) => string;
export type LineParser = (line: TextLine) => ParsedLine;
export type EntryGrouper = (lines: TextLine[]) => EntryGroup[];
export type WordNameExtractor = (group: EntryGroup, fallbackName: string) => string;

// Make EntryTransformer generic
export type EntryTransformer<T = WordEntry> = (group: EntryGroup, wordName: string) => T;
export type CustomTransformer<T = any> = (group: EntryGroup) => T;

// Generic pipeline interface
export interface TextProcessingPipeline<TEntry = WordEntry, TCustom = any> {
  textTransform: TextTransformer;
  lineParser: LineParser;
  entryGrouper: EntryGrouper;
  wordNameExtractor: WordNameExtractor;
  entryTransformer: EntryTransformer<TEntry>;
  customTransformers: Record<string, CustomTransformer<TCustom>>;
}

// Specialized pipeline types
export type BasicPipeline = TextProcessingPipeline<WordEntry, any>
export type PosAwarePipeline = TextProcessingPipeline<PosAwareWordEntry | VerbEntry, any>

// NEW: POS-aware entry types that part-of-speech-transformers actually returns
export interface PosAwareWordEntry {
  name: string;
  etymology: EnhancedEtymologyEntry[];
  sources: string[];
}

export interface VerbEntry {
  infinitive: string;  // Note: different from WordEntry which has 'name'
  etymology: EnhancedEtymologyEntry[];
  sources: string[];
}

export interface EnhancedEtymologyEntry extends EtymologyEntry {
  conjugations?: {
    thirdPerson?: string;
    pastTense?: string;
    progressive?: string;
  };
  gender?: 'masculine' | 'feminine' | 'neuter';
  number?: 'singular' | 'plural';
  degrees?: {
    positive?: string;
    comparative?: string;
    superlative?: string;
  };
}

// Keep these for backward compatibility
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