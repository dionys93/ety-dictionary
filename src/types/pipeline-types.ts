// src/types/pipeline-types.ts
export interface RawLine {
  content: string;
  lineNumber: number;
}

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
export type LineParser = (line: RawLine) => ParsedLine;
export type EntryGrouper = (lines: RawLine[]) => EntryGroup[];
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