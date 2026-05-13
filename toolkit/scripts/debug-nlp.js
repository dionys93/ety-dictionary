import fs from 'fs';
import path from 'path';
import nlp from 'compromise';

// 1. Capture CLI Arguments
const args = process.argv.slice(2);
const inputFile = args[0];
const outputFile = args[1];

if (!inputFile) {
    console.error('❌ Error: Missing input file.');
    console.log('Usage: node scripts/debug-nlp.js <path/to/input.txt> [path/to/output.txt]');
    process.exit(1);
}

// 2. Validation Checks
if (!fs.existsSync(inputFile)) {
    console.error(`❌ Error: Cannot find input file at ${inputFile}`);
    process.exit(1);
}

// 3. Load Data
console.log(`🔍 Analyzing NLP Context for: ${inputFile}...`);
const text = fs.readFileSync(inputFile, 'utf8');
const doc = nlp(text);

let debugOutput = `🤖 Compromise.js Context Analyzer\n`;
debugOutput += `=================================================================\n\n`;

// 4. Build the Report (Sentence by Sentence for context)
doc.sentences().forEach((sentence, sIdx) => {
    debugOutput += `[Sentence ${sIdx + 1}]\n`;
    debugOutput += `"${sentence.text().trim()}"\n`;
    debugOutput += `-----------------------------------------------------------------\n`;

    sentence.terms().forEach((term) => {
        // Extract raw text, the normalized lookup text, and the assigned tags
        const original = term.text();
        const normal = term.text('normal');
        
        // Safely extract tags array
        const termData = term.json()[0];
        const tags = termData && termData.terms && termData.terms[0] 
            ? termData.terms[0].tags 
            : [];

        // Skip purely empty tokens (like double spaces between sentences)
        if (!normal && tags.length === 0) return;

        debugOutput += `  Word   : '${original}'\n`;
        
        // Only print the 'Normal' line if compromise changed the word (e.g., 'circles' -> 'circle')
        if (original.toLowerCase().trim() !== normal && normal) {
            debugOutput += `  Normal : '${normal}'\n`;
        }
        
        debugOutput += `  Tags   : [ ${tags.join(', ')} ]\n\n`;
    });
});

// 5. Output Routing
if (outputFile) {
    const outDir = path.dirname(outputFile);
    if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
    }
    fs.writeFileSync(outputFile, debugOutput, 'utf8');
    console.log(`✅ NLP Debug report saved to: ${outputFile}`);
} else {
    // If no output file was provided, just print it to the terminal
    console.log(debugOutput);
}