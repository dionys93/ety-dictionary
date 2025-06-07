// src/core/types/json-schemas.ts
// Pure JSON schema definitions

export interface EtymologyJSON {
  readonly word: string
  readonly etymology: readonly {
    readonly text: string
    readonly language: string
    readonly languageCode?: string
    readonly isRoot: boolean
    readonly isModern: boolean
    readonly isInglish: boolean
  }[]
  readonly morphology?: {
    readonly form: string
    readonly partsOfSpeech: readonly string[]
    readonly inflections?: string
  }
  readonly sources: readonly string[]
}

export interface CompactJSON {
  readonly totalWords: number
  readonly languages: readonly string[]
  readonly wordList: readonly {
    readonly word: string
    readonly sourceCount: number
  }[]
}

export interface GraphJSON {
  readonly nodes: readonly {
    readonly id: string
    readonly type: 'word' | 'root' | 'language'
    readonly label: string
  }[]
  readonly edges: readonly {
    readonly source: string
    readonly target: string
    readonly type: 'derives_from' | 'related_to'
  }[]
}