import { describe, it, expect } from 'vitest';
import winkNLP from 'wink-nlp';
import model from 'wink-eng-lite-web-model';

// Initialize the NLP engine with the English model
const nlp = winkNLP(model);

describe.skip('NLP Engine Spike: wink-nlp Baseline', () => {
    
    it('accurately distinguishes identical words as verbs and nouns based on context', () => {
        const doc = nlp.readDoc('She circles the circles.');
        
        const normals = doc.tokens().out(nlp.its.normal);
        const posTags = doc.tokens().out(nlp.its.pos);
        const lemmas = doc.tokens().out(nlp.its.lemma);

        // Indices: 0: she | 1: circles | 2: the | 3: circles | 4: .

        // Assert the Verb
        expect(normals[1]).toBe('circles');
        expect(posTags[1]).toBe('VERB');
        expect(lemmas[1]).toBe('circle');

        // Assert the Noun
        expect(normals[3]).toBe('circles');
        expect(posTags[3]).toBe('NOUN');
        expect(lemmas[3]).toBe('circle');
    });

    it('handles ambiguous words based on context (Watch)', () => {
        const text1 = "I bought a gold watch.";
        const text2 = "Watch me do this.";

        const doc1 = nlp.readDoc(text1);
        const doc2 = nlp.readDoc(text2);

        // "watch" is at index 4 in sentence 1
        expect(doc1.tokens().itemAt(4).out(nlp.its.normal)).toBe('watch');
        expect(doc1.tokens().itemAt(4).out(nlp.its.pos)).toBe('NOUN');

        // "Watch" is at index 0 in sentence 2
        expect(doc2.tokens().itemAt(0).out(nlp.its.normal)).toBe('watch');
        expect(doc2.tokens().itemAt(0).out(nlp.its.pos)).toBe('VERB');
    });

    it('categorizes complex verb tenses, tracking lemmas', () => {
        const text = "I walked. I walk. I will walk. I am walking.";
        const doc = nlp.readDoc(text);

        console.log('\n--- 1. VERB TENSES & LEMMAS ---');
        doc.tokens().each(t => {
            if (t.out(nlp.its.pos) === 'VERB' || t.out(nlp.its.pos) === 'AUX') {
                console.log(`Word: "${t.out(nlp.its.value).padEnd(8)}" | Normal: "${t.out(nlp.its.normal).padEnd(8)}" | POS: ${t.out(nlp.its.pos).padEnd(4)} | Lemma: ${t.out(nlp.its.lemma)}`);
            }
        });

        // "walked" (Index 1) -> VERB, lemma 'walk'
        expect(doc.tokens().itemAt(1).out(nlp.its.normal)).toBe('walked');
        expect(doc.tokens().itemAt(1).out(nlp.its.pos)).toBe('VERB');
        expect(doc.tokens().itemAt(1).out(nlp.its.lemma)).toBe('walk');

        // "walking" (Index 13) -> VERB, lemma 'walk'
        expect(doc.tokens().itemAt(13).out(nlp.its.normal)).toBe('walking');
        expect(doc.tokens().itemAt(13).out(nlp.its.pos)).toBe('VERB');
        expect(doc.tokens().itemAt(13).out(nlp.its.lemma)).toBe('walk');
    });

    it('categorizes singular vs irregular plural nouns', () => {
        const text = "The child saw three geese, two mice, and a dog.";
        const doc = nlp.readDoc(text);

        console.log('\n--- 2. NOUN PLURALIZATION (LEMMATIZATION) ---');
        doc.tokens().each(t => {
            if (t.out(nlp.its.pos) === 'NOUN') {
                console.log(`Word: "${t.out(nlp.its.value).padEnd(8)}" | POS: ${t.out(nlp.its.pos)} | Lemma: ${t.out(nlp.its.lemma)}`);
            }
        });

        const normals = doc.tokens().out(nlp.its.normal);
        const lemmas = doc.tokens().out(nlp.its.lemma);

        // Find "geese" and ensure it lemmatizes to "goose"
        const geeseIdx = normals.indexOf('geese');
        expect(lemmas[geeseIdx]).toBe('goose');

        // Find "mice" and ensure it lemmatizes to "mouse"
        const miceIdx = normals.indexOf('mice');
        expect(lemmas[miceIdx]).toBe('mouse');
    });

    it('explores modals and auxiliary verbs vs main verbs', () => {
        const sentences = [
            "I can swim.",
            "She might have gone.",
            "I do not know.",
            "Do you do yoga?"
        ];

        console.log('\n--- 3. AUXILIARIES & MODALS ---');
        sentences.forEach((text, i) => {
            const doc = nlp.readDoc(text);
            console.log(`\nSentence ${i + 1}: "${text}"`);
            
            doc.tokens().each(t => {
                if (['VERB', 'AUX', 'PART'].includes(t.out(nlp.its.pos))) {
                    console.log(` -> "${t.out(nlp.its.value).padEnd(6)}" | Normal: "${t.out(nlp.its.normal).padEnd(6)}" | POS: ${t.out(nlp.its.pos).padEnd(4)} | Lemma: ${t.out(nlp.its.lemma)}`);
                }
            });
        });

        const doubleDoDoc = nlp.readDoc("Do you do yoga?");
        const posTags = doubleDoDoc.tokens().out(nlp.its.pos);
        
        // "Do" (Index 0) acts as an Auxiliary
        expect(posTags[0]).toBe('AUX');
        // "do" (Index 2) acts as the Main Verb
        expect(posTags[2]).toBe('VERB');
    });

    it('handles tokenization and categorization of contractions', () => {
        const sentences = [
            "I don't know.",
            "She can't swim.",
            "He's running.",
            "I'll go.",
            "They've arrived."
        ];

        console.log('\n--- 4. CONTRACTIONS & SPLITTING ---');
        sentences.forEach(text => {
            const doc = nlp.readDoc(text);
            console.log(`\nOriginal: "${text}"`);

            doc.tokens().each(t => {
                // Ignore punctuation so the log is easier to read
                if (t.out(nlp.its.type) === 'word') {
                    console.log(`  Raw: "${t.out(nlp.its.value).padEnd(5)}" | Normal: "${t.out(nlp.its.normal).padEnd(5)}" | POS: ${t.out(nlp.its.pos).padEnd(4)} | Lemma: ${t.out(nlp.its.lemma)}`);
                }
            });
        });

        // Assert on "don't" -> should split into "do" and "n't"
        const doc1 = nlp.readDoc("I don't know.");
        const normals1 = doc1.tokens().out(nlp.its.normal);
        const posTags1 = doc1.tokens().out(nlp.its.pos);

        expect(normals1[1]).toBe('do');
        expect(posTags1[1]).toBe('AUX');
        expect(normals1[2]).toBe("n't");
        expect(posTags1[2]).toBe('PART'); // Particle (Negation)

        // Assert on "I'll" -> should split into "I" and "'ll"
        const doc2 = nlp.readDoc("I'll go.");
        const normals2 = doc2.tokens().out(nlp.its.normal);
        const posTags2 = doc2.tokens().out(nlp.its.pos);
        const lemmas2 = doc2.tokens().out(nlp.its.lemma);

        expect(normals2[0]).toBe('i');
        expect(posTags2[0]).toBe('PRON');
        expect(normals2[1]).toBe("'ll");
        expect(posTags2[1]).toBe('AUX');
        expect(lemmas2[1]).toBe("will"); // It correctly Lemmatizes 'll to 'will'!
    });

});