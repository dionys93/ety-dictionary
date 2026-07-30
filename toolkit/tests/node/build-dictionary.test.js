import { describe, it, expect } from 'vitest';
import { buildBrain } from '../../scripts/build-dictionary.js';

describe('Dictionary Compiler (buildBrain)', () => {

    it('correctly maps roots and attaches conjugations for downstream JIT evaluation', () => {
        const rawDataset = [
            {
                me_word: "make",
                inglisce_word: "mâche",
                pos: "verb",
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
        expect(brain['make']['Verb']).toBe('mâche'); 
        expect(brain['makes']).toBeUndefined();      
        expect(brain['made']).toBeUndefined();       
        expect(brain['making']).toBeUndefined();

        // But the conjugations object MUST be attached to the root, NAMESPACED by pos!
        expect(brain['make']['Verb_conjugations']).toBeDefined();
        expect(brain['make']['Verb_conjugations'].past).toBe('mâde');
        expect(brain['make']['Verb_conjugations'].gerund).toBe('-ing');

        // --- Assert 'SPEAK' mappings ---
        expect(brain['speak']['Verb']).toBe('spieche');
        expect(brain['speak']['Verb_conjugations'].past).toBe('spóc');
        expect(brain['speak']['Verb_conjugations'].participle).toBe('spócan');
    });

});

describe('Translation Brain Compiler > Auxiliaries & Modals', () => {
    
    it('correctly maps all explicit forms of "to be"', () => {
        const dataset = [{
            me_word: "be",
            inglisce_word: "bie",
            pos: "aux",
            // Parser-emitted shape: explicit pairs are ME-zipped by the parser
            conjugations: { explicit: { am: "am", is: "is", are: "are", was: "uas", were: "uere", been: "bign", being: "bying", "isn't": "isn't", "aren't": "aren't", "wasn't": "uasn't", "weren't": "ueren't" } }
        }];

        const { brain } = buildBrain(dataset);

        expect(brain['be']).toBeDefined();
        expect(brain['am']['Verb']).toBe('am');
        expect(brain['is']['Verb']).toBe('is');
        expect(brain['are']['Verb']).toBe('are');
        expect(brain['was']['Verb']).toBe('uas');
        expect(brain['were']['Verb']).toBe('uere');
        expect(brain['been']['Verb']).toBe('bign');
        expect(brain['being']['Verb']).toBe('bying');
    });

    it('correctly maps all explicit forms of "to do"', () => {
        const dataset = [{
            me_word: "do",
            inglisce_word: "dou",
            pos: "v, aux",
            conjugations: { explicit: { does: "dus", did: "did", done: "don", doing: "douing", "don't": "don't", "doesn't": "dusn't", "didn't": "didn't" } }
        }];

        const { brain } = buildBrain(dataset);

        expect(brain['do']['Verb']).toBe('dou');
        expect(brain['does']['Verb']).toBe('dus');
        expect(brain['did']['Verb']).toBe('did');
        expect(brain['done']['Verb']).toBe('don');
        expect(brain['doing']['Verb']).toBe('douing');
    });

    it('correctly maps all explicit forms of "to have"', () => {
        const dataset = [{
            me_word: "have",
            inglisce_word: "have",
            pos: "v, aux",
            conjugations: { explicit: { has: "has", had: "had", having: "having", "haven't": "haven't", "hasn't": "hasn't", "hadn't": "hadn't" } }
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
            conjugations: { explicit: { could: "coûd" } }
        }];

        const { brain } = buildBrain(dataset);

        expect(brain['can']['Modal']).toBe('can');
        expect(brain['could']['Modal']).toBe('coûd');
        // No explicit "can't" pair in this dataset -> cannot falls back to the base
        expect(brain['cannot']['Modal']).toBe('can');
        expect(brain["can't"]).toBeUndefined();
        expect(brain["couldn't"]).toBeUndefined();
    });
});