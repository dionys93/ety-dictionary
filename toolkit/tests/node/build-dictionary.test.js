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

describe('Translation Brain Compiler > Auxiliaries & Modals', () => {
    
    it('correctly maps all explicit forms of "to be"', () => {
        const dataset = [{
            me_word: "be",
            inglisce_word: "bie",
            pos: "aux",
            // Simulating the CURRENT Bash output (which gets truncated/mangled) 
            // OR the FUTURE Bash output (which will be a full 11-item array).
            // Once the fix is in, the JS will accept the full array here.
            conjugations: ["am", "is", "are", "uas", "uere", "bign", "bying", "isn't", "aren't", "uasn't", "ueren't"] 
        }];

        const { brain } = buildBrain(dataset);

        // Core forms
        expect(brain['be']).toBeDefined();
        expect(brain['am']['Verb']).toBe('am');
        expect(brain['is']['Verb']).toBe('is');
        expect(brain['are']['Verb']).toBe('are');
        expect(brain['was']['Verb']).toBe('uas');
        expect(brain['were']['Verb']).toBe('uere');
        expect(brain['been']['Verb']).toBe('bign');
        expect(brain['being']['Verb']).toBe('bying');

        // Negations
        expect(brain["isn't"]['Verb']).toBe("isn't");
        expect(brain["aren't"]['Verb']).toBe("aren't");
        expect(brain["wasn't"]['Verb']).toBe("uasn't");
        expect(brain["weren't"]['Verb']).toBe("ueren't");
    });

    it('correctly maps all explicit forms of "to do"', () => {
        const dataset = [{
            me_word: "do",
            inglisce_word: "dou",
            pos: "v, aux",
            // Use the explicit array just like your do.txt does!
            conjugations: ["dus", "did", "don", "douing", "don't", "dusn't", "didn't"]
        }];

        const { brain } = buildBrain(dataset);

        expect(brain['do']['Verb']).toBe('dou');
        expect(brain['does']['Verb']).toBe('dus');
        expect(brain['did']['Verb']).toBe('did');
        expect(brain['done']['Verb']).toBe('don');
        expect(brain['doing']['Verb']).toBe('douing');
        expect(brain["don't"]['Verb']).toBe("don't"); 
    });

    it('correctly maps all explicit forms of "to have"', () => {
        const dataset = [{
            me_word: "have",
            inglisce_word: "have",
            pos: "v, aux",
            conjugations: {
                third_singular: "has",
                past: "had",
                participle: "had",
                gerund: "having"
            }
        }];

        const { brain } = buildBrain(dataset);

        expect(brain['have']['Verb']).toBe('have');
        expect(brain['has']['Verb']).toBe('has');
        expect(brain['had']['Verb']).toBe('had');
        expect(brain['having']['Verb']).toBe('having');
    });

    it('correctly resolves Modals and their past/negated forms', () => {
        const dataset = [{
            me_word: "can",
            inglisce_word: "can",
            pos: "modal",
            conjugations: { past: "coûd" }
        }];

        const { brain } = buildBrain(dataset);

        expect(brain['can']['Modal']).toBe('can');
        expect(brain['could']['Modal']).toBe('coûd');
        
        // Modal Negations
        expect(brain["can't"]['Modal']).toBe('can'); 
        expect(brain['cannot']['Modal']).toBe('can');
        expect(brain["couldn't"]['Modal']).toBe('coûd');
    });
});
