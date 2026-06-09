// import { describe, it } from 'vitest';
// import fs from 'fs';
// import path from 'path';
// import nlp from 'compromise';

// const OEDIPUS_DIR = path.resolve(__dirname, '../fixtures/oedipus-rex');

// describe('Compromise Raw Tag Dump: Oedipus Rex', () => {

//     it('logs every word and its POS tags for all pages', () => {
//         const files = ['2.txt', '3.txt', '4.txt'];

//         files.forEach(file => {
//             console.log(`\n\n=========================================================`);
//             console.log(` PARSING FILE: ${file}`);
//             console.log(`=========================================================`);
            
//             const filePath = path.join(OEDIPUS_DIR, file);
//             if (!fs.existsSync(filePath)) {
//                 console.log(`File not found: ${filePath}`);
//                 return;
//             }

//             const text = fs.readFileSync(filePath, 'utf-8');
//             const doc = nlp(text);

//             // Loop through every single term/word and dump its exact data
//             doc.terms().json().forEach(termObj => {
//                 const term = termObj.terms[0];
                
//                 // Format the output so it's clean and easy to read in the terminal
//                 const originalWord = `"${term.text}"`.padEnd(18);
//                 const rootWord = `"${term.normal}"`.padEnd(16);
//                 const tags = term.tags.join(', ');

//                 console.log(`Word: ${originalWord} | Root: ${rootWord} | Tags: [${tags}]`);
//             });
//         });
//     });
// });

import { describe, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import nlp from 'compromise';

const OEDIPUS_DIR = path.resolve(__dirname, '../fixtures/oedipus-rex');

describe.skip('Compromise Sentence-by-Sentence Parser', () => {

    it('logs tags strictly sentence by sentence', () => {
        const text = fs.readFileSync(path.join(OEDIPUS_DIR, '2.txt'), 'utf-8');
        
        // Load the document
        const doc = nlp(text);

        // Force the engine to iterate strictly by sentence boundaries
        doc.sentences().json().forEach((sentence, index) => {
            console.log(`\n=========================================================`);
            console.log(` SENTENCE ${index + 1}`);
            console.log(` "${sentence.text.trim()}"`);
            console.log(`=========================================================`);

            sentence.terms.forEach(termObj => {
                // Ensure we are looking at the exact term data
                const term = termObj.terms ? termObj.terms[0] : termObj;
                
                const originalWord = `"${term.text}"`.padEnd(18);
                const tags = term.tags.join(', ');

                console.log(`Word: ${originalWord} | Tags: [${tags}]`);
            });
        });
    });
});