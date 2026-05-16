import { describe, it, expect } from 'vitest';
import nlp from 'compromise';

describe('Compromise NLP - Baseline Categorization Explorer', () => {
    
    it('categorizes standard parts of speech', () => {
        const text = "The quick brown fox jumps over the extremely lazy dog.";
        const doc = nlp(text);

        // Extract the tags for every single word
        const tags = doc.out('tags');
        
        console.log('\n--- 1. BASIC POS CATEGORIZATION ---');
        console.log(tags);

        // Basic sanity checks
        expect(doc.has('#Noun')).toBe(true);
        expect(doc.has('#Adjective')).toBe(true);
    });

    it('categorizes complex verb tenses and modals', () => {
        // Mixing past, present, future, gerunds, and modals (could/should)
        const text = "I walked. I walk. I will walk. I am walking. I could have walked.";
        const doc = nlp(text);

        // .json() gives us a deep dive into how it breaks down verbs
        const verbs = doc.verbs().json();

        console.log('\n--- 2. VERB TENSES & MODALS ---');
        verbs.forEach(v => {
            console.log(`Text: "${v.text}" | Tags:`, v.terms.map(t => t.tags));
        });

        // Ensure it recognizes standard tenses natively
        expect(doc.match('walked').has('#PastTense')).toBe(true);
        expect(doc.match('walking').has('#Gerund')).toBe(true);
    });

    it('categorizes singular vs plural nouns', () => {
        // Testing regular and irregular plurals
        const text = "The child saw three geese, two mice, and a dog.";
        const doc = nlp(text);

        console.log('\n--- 3. NOUN PLURALIZATION ---');
        const nouns = doc.nouns().json();
        nouns.forEach(n => {
            console.log(`Noun: "${n.text}" | isPlural: ${n.isPlural} | Tags:`, n.terms[0].tags);
        });

        expect(doc.match('geese').has('#Plural')).toBe(true);
        expect(doc.match('child').has('#Singular')).toBe(true);
    });

    it('handles ambiguous words based on context', () => {
        // "Watch" can be a noun or a verb depending on placement
        const text1 = "I bought a gold watch.";
        const text2 = "Watch me do this.";

        console.log('\n--- 4. CONTEXTUAL DISAMBIGUATION ---');
        console.log('Sentence 1 (Noun):', nlp(text1).match('watch').out('tags'));
        console.log('Sentence 2 (Verb):', nlp(text2).match('watch').out('tags'));

        expect(nlp(text1).match('watch').has('#Noun')).toBe(true);
        expect(nlp(text2).match('watch').has('#Verb')).toBe(true);
    });
});