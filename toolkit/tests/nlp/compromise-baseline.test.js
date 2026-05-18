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
        const text = "The child saw three geese, two mice, and a dog.";
        const doc = nlp(text);

        console.log('\n--- 3. NOUN PLURALIZATION ---');

        // .nouns() grabs the whole phrase, so we look at the JSON breakdown
        const nounPhrases = doc.nouns().json();

        nounPhrases.forEach(phrase => {
            // Hunt inside the phrase for the actual word tagged as a Noun
            const headNoun = phrase.terms.find(t => t.tags.includes('Noun'));

            if (headNoun) {
                // Check the tags of the specific root word, not the phrase
                const isPlural = headNoun.tags.includes('Plural');
                console.log(`Phrase: "${phrase.text.padEnd(15)}" | Root: "${headNoun.text.padEnd(6)}" | Plural: ${isPlural} | Tags:`, headNoun.tags);
            }
        });

        // The assertions remain the same, because .match() hunts for the specific word!
        expect(doc.match('geese').has('#Plural')).toBe(true);
        expect(doc.match('child').has('#Singular')).toBe(true);
    });

    it('handles ambiguous words based on context', () => {
        // "Watch" can be a noun or a verb depending on placement
        const text1 = "I bought a gold watch.";
        const text2 = "Watch me do this.";
        const text3 = "She circles the correct answer."
        const text4 = "The circles are different colors."

        console.log('\n--- 4. CONTEXTUAL DISAMBIGUATION ---');
        console.log('Sentence 1 (Noun):', nlp(text1).match('watch').out('tags'));
        console.log('Sentence 2 (Verb):', nlp(text2).match('watch').out('tags'));
        console.log('Sentence 3 (Verb):', nlp(text3).match('circles').out('tags'));
        console.log('Sentence 4 (Noun):', nlp(text4).match('circles').out('tags'));

        expect(nlp(text1).match('watch').has('#Noun')).toBe(true);
        expect(nlp(text2).match('watch').has('#Verb')).toBe(true);
    });

    it('explores modals and auxiliary verbs (including "do" in questions/statements)', () => {
        // A mix of pure modals, perfect auxiliaries, do-support, and 'do' as a main verb
        const sentences = [
            "I can swim.",                     // Pure modal
            "She might have gone.",            // Modal + Perfect Auxiliary
            "I do not know.",                  // 'do' as auxiliary (negation)
            "Do you know the answer?",         // 'do' as auxiliary (question)
            "I do my homework every night."    // 'do' as main verb
        ];

        console.log('\n--- 5. MODALS & AUXILIARIES ---');

        sentences.forEach((text, i) => {
            const doc = nlp(text);
            console.log(`\nSentence ${i + 1}: "${text}"`);

            // Let's look at the whole verb phrase first to see how it groups them
            doc.verbs().json().forEach(v => {
                console.log(`  Verb Phrase: "${v.text}"`);
                v.terms.forEach(t => {
                    console.log(`    -> "${t.text.padEnd(8)}" Tags:`, t.tags);
                });
            });
        });

        const fullDoc = nlp(sentences.join(' '));

        // Assertions to ensure Compromise catches standard modals
        expect(fullDoc.match('can').has('#Modal')).toBe(true);
        expect(fullDoc.match('might').has('#Modal')).toBe(true);

        // Let's assert that 'have' in 'might have gone' is recognized as an auxiliary
        expect(fullDoc.match('have').has('#Auxiliary')).toBe(true);
    });

    it('categorizes BOTH helping verbs and main verbs in the same sentence', () => {
        const sentences = [
            "I can swim.",
            "She might have gone.",
            "I do not know.",
            "Do you know the answer?",
            "I do my homework every night.",
            "Do you do yoga?",
            "Does she do yoga?",
            "She does do yoga."
        ];

        console.log('\n--- 5B. HELPER VS MAIN VERB CATEGORIZATION ---');

        sentences.forEach(text => {
            const doc = nlp(text);
            console.log(`\nSentence: "${text}"`);

            // Instead of trusting Compromise to group phrases perfectly (which fails on "Do you know"),
            // we will loop through every single word and explicitly pluck out the verbs/modals.
            doc.terms().json().forEach(termObj => {
                const term = termObj.terms[0]; // Drill down to the raw word data
                const wordText = term.text;
                const tags = term.tags;

                // Only print words tagged with verb-related or negative categories
                if (tags.some(tag => ['Verb', 'Modal', 'Auxiliary', 'Negative', 'QuestionWord'].includes(tag))) {

                    // Add a little visual flag so we can easily spot the Auxiliary vs Main verb
                    let role = "Main Verb";
                    if (tags.includes('Modal')) role = "Modal";
                    if (tags.includes('Auxiliary')) role = "Auxiliary";
                    if (tags.includes('Negative')) role = "Negation";

                    console.log(`  [${role.padEnd(9)}] "${wordText.padEnd(6)}" | Tags:`, tags);
                }
            });
        });

        // Assertions to ensure it correctly tags the double "do" scenario
        const doubleDo = nlp("Do you do yoga?");
        const doWords = doubleDo.match('do').json();

        // The first 'Do' acts as a helper, but Compromise tags it as a QuestionWord instead of an Auxiliary!
        expect(doWords[0].terms[0].tags).toContain('QuestionWord');
        expect(doWords[0].terms[0].tags).toContain('Verb');

        // The second 'do' should be a standard Verb/Infinitive, completely devoid of question properties
        expect(doWords[1].terms[0].tags).toContain('Verb');
        expect(doWords[1].terms[0].tags).not.toContain('QuestionWord');
    
        // --- Test: "Does she do yoga?" ---
        const doesSheDo = nlp("Does she do yoga?");
        
        // Match 'does' (the helper)
        const doesWord = doesSheDo.match('does').json();
        expect(doesWord[0].terms[0].tags).toContain('QuestionWord');
        expect(doesWord[0].terms[0].tags).toContain('Verb');
        
        // Match 'do' (the main verb)
        const doMainWord = doesSheDo.match('do').json();
        expect(doMainWord[0].terms[0].tags).toContain('Verb');
        expect(doMainWord[0].terms[0].tags).not.toContain('QuestionWord');
    

        // --- Test: "She does do yoga." (Emphatic) ---
        const sheDoesDo = nlp("She does do yoga.");
        
        // Match 'does' (the emphatic helper)
        const emphaticDoes = sheDoesDo.match('does').json();
        expect(emphaticDoes[0].terms[0].tags).not.toContain('QuestionWord');
        expect(emphaticDoes[0].terms[0].tags).toContain('Verb');
        expect(emphaticDoes[0].terms[0].tags).toContain('Auxiliary');
        
        // Match 'do' (the main verb)
        const emphaticMainDo = sheDoesDo.match('do').json();
        expect(emphaticMainDo[0].terms[0].tags).toContain('Verb');
        expect(emphaticMainDo[0].terms[0].tags).toContain('Infinitive');
        
    });

    it('handles implicit expansion and categorization of contractions', () => {
        const sentences = [
            "I don't know.",
            "She can't swim.",
            "He's running.",       // "is" as auxiliary
            "She's happy.",        // "is" as copula/main verb
            "They've arrived.",
            "I'll go."
        ];

        console.log('\n--- 6. CONTRACTIONS & NEGATION ---');

        sentences.forEach(text => {
            const doc = nlp(text);
            console.log(`\nOriginal: "${text}"`);

            // By looking at doc.terms(), we can see if Compromise split the contraction
            doc.terms().json().forEach(t => {
                // We print t.text (the surface word) and t.normal (the normalized/expanded word)
                console.log(`  Surface: "${t.text.padEnd(8)}" | Normalized: "${t.terms[0].normal.padEnd(6)}" | Tags:`, t.terms[0].tags);
            });

            // Let's also see how it groups the verbs together
            console.log(`  Verb Grouping:`, doc.verbs().out('array'));
        });

        const doc1 = nlp("I don't know.");

        // Assert that Compromise successfully identifies the hidden "not"
        expect(doc1.has('not')).toBe(true);
        expect(doc1.match("don't").has('#Negative')).toBe(true);

        const doc2 = nlp("I'll go.");
        // Assert that it understands "will" is hiding inside "I'll"
        expect(doc2.has('will')).toBe(true);
        expect(doc2.match("I'll").has('#Modal')).toBe(true);
    });

});