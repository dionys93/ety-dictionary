import { describe, it, expect } from 'vitest';
import { buildBrain } from '../../scripts/build-dictionary.js';

describe('Dictionary Compiler (buildBrain)', () => {

    it('correctly maps mixed irregulars and shorthand suffixes to specific grammatical tenses', () => {
        // We simulate the raw output of etym-flatten
        const rawDataset = [
            {
                me_word: "make",
                inglisce_word: "mâche",
                pos: "verb",
                // Mixed array: Full words for past/participle, shorthand for present/gerund
                conjugations: {
                    present: "",
                    third_singular: "-s",
                    past: "mâde",
                    participle: "mâde",
                    gerund: "-ing"
                }
            },
            {
                me_word: "speak",
                inglisce_word: "spieche",
                pos: "verb",
                conjugations: {
                    present: "",
                    third_singular: "-s",
                    past: "spóc",
                    participle: "spócan",
                    gerund: "-ing"
                }
            }
        ];

        const { brain } = buildBrain(rawDataset);

        // --- Assert 'MAKE' mappings ---
        expect(brain['make']['Verb']).toBe('mâche');       // Infinitive
        expect(brain['makes']['Verb']).toBe('mâcs');       // 3rd Person Present 
        expect(brain['made']['Verb']).toBe('mâde');       // Past/Participle 
        expect(brain['making']['Verb']).toBe('mâching');   // Gerund

        // --- Assert 'SPEAK' mappings ---
        expect(brain['speaks']['Verb']).toBe('spiecs');    // 3rd Person Present
        expect(brain['spoke']['Verb']).toBe('spóc');       // Past
        expect(brain['spoken']['Verb']).toBe('spócan');    // Participle
        expect(brain['speaking']['Verb']).toBe('spieching'); // Gerund
    });

});
