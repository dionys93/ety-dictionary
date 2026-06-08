import { describe, it, expect } from 'vitest';
import winkNLP from 'wink-nlp';
import model from 'wink-eng-lite-web-model';

// Initialize the NLP engine with the English model
const nlp = winkNLP(model);

describe('NLP Engine Spike: wink-nlp Baseline', () => {
    
    it('accurately distinguishes identical words as verbs and nouns based on context', () => {
        const doc = nlp.readDoc('She circles the circles.');
        
        // Extract parallel arrays of properties
        const normals = doc.tokens().out(nlp.its.normal);
        const posTags = doc.tokens().out(nlp.its.pos);
        const lemmas = doc.tokens().out(nlp.its.lemma);

        // Indices:
        // 0: she | 1: circles | 2: the | 3: circles | 4: .

        // Assert the Verb
        expect(normals[1]).toBe('circles');
        expect(posTags[1]).toBe('VERB');
        expect(lemmas[1]).toBe('circle');

        // Assert the Noun
        expect(normals[3]).toBe('circles');
        expect(posTags[3]).toBe('NOUN');
        expect(lemmas[3]).toBe('circle');
    });

    it('correctly identifies standard plural nouns and their lemmas', () => {
        const doc = nlp.readDoc('She makes the cakes.');
        
        const normals = doc.tokens().out(nlp.its.normal);
        const posTags = doc.tokens().out(nlp.its.pos);
        const lemmas = doc.tokens().out(nlp.its.lemma);

        // Assert the Verb ('makes')
        expect(normals[1]).toBe('makes');
        expect(posTags[1]).toBe('VERB');
        expect(lemmas[1]).toBe('make');

        // Assert the Noun ('cakes')
        expect(normals[3]).toBe('cakes');
        expect(posTags[3]).toBe('NOUN');
        expect(lemmas[3]).toBe('cake');
    });

    it('correctly tags words following determiners as nouns', () => {
        const doc = nlp.readDoc('I have the receipts.');
        
        const normals = doc.tokens().out(nlp.its.normal);
        const posTags = doc.tokens().out(nlp.its.pos);
        const lemmas = doc.tokens().out(nlp.its.lemma);

        // Assert the Noun ('receipts')
        expect(normals[3]).toBe('receipts');
        expect(posTags[3]).toBe('NOUN');
        expect(lemmas[3]).toBe('receipt');
    });
});