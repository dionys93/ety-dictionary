import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import nlp from 'compromise';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const JSONL_FILE = path.resolve(__dirname, '../dist/master_dataset.jsonl');
const OUTPUT_FILE = path.resolve(__dirname, '../dist/translationBrain.json');

const brain = {};

const posMap = {
    'verb': 'Verb', 'transitive verb': 'Verb', 'intransitive verb': 'Verb',
    'noun': 'Noun', 'masculine noun': 'Noun', 'feminine noun': 'Noun',
    'adjective': 'Adjective', 'adverb': 'Adverb', 'preposition': 'Preposition',
    'pronoun': 'Pronoun', 'conjunction': 'Conjunction', 'number': 'Value', 'num': 'Value',
    'article': 'Determiner', 'art': 'Determiner', 
    'definite article': 'Determiner', 'indefinite article': 'Determiner',
    'defin': 'Determiner', 'indefin': 'Determiner',
    'modal': 'Modal', 'auxiliary': 'Copula'
};

function addWord(eng, inglisce, pos) {
    if (!eng || !inglisce) return;
    const cleanEng = eng.toLowerCase().trim();
    const cleanIng = inglisce.replace(/[.,!?()[\]{}]/g, '').trim();
    brain[cleanEng] = brain[cleanEng] || {};
    brain[cleanEng][pos] = brain[cleanEng][pos] || cleanIng;
}

async function compile() {
    console.log('🧠 Compiling Translation Brain with Explicit Morphology & Auxiliaries...');

    if (!fs.existsSync(JSONL_FILE)) {
        console.error(`❌ JSONL file not found at ${JSONL_FILE}!`);
        process.exit(1);
    }

    const fileStream = fs.createReadStream(JSONL_FILE);
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

    for await (const line of rl) {
        if (!line.trim()) continue;
        
        const data = JSON.parse(line);
        const engWord = data.me_word;
        const inglisceWord = data.inglisce_word;
        const posCategory = posMap[data.pos] || 'Unknown';
        
        // Strip out any rogue [LANG] tags that bled into the array
        const conjugations = (data.conjugations || []).filter(w => !w.startsWith('['));

        if (!engWord || !inglisceWord || posCategory === 'Unknown') continue;

        // 1. Always map the base word
        addWord(engWord, inglisceWord, posCategory);

        // 2. Map Standard Verbs
        if (posCategory === 'Verb' && conjugations.length > 0) {
            const doc = nlp(engWord).tag('Verb');
            const conj = doc.verbs().conjugate()[0];

            if (conj) {
                addWord(conj.PresentTense, conjugations[0], 'Verb');
                
                if (conjugations.length === 3) {
                    addWord(conj.PastTense, conjugations[1], 'Verb');
                    addWord(conj.Participle, conjugations[1], 'Verb');
                    addWord(conj.Gerund, conjugations[2], 'Verb');
                } else if (conjugations.length >= 4) {
                    addWord(conj.PastTense, conjugations[1], 'Verb');
                    addWord(conj.Participle, conjugations[2], 'Verb');
                    addWord(conj.Gerund, conjugations[3], 'Verb');
                }
            }
        }

        // 3. Map Nouns
        if (posCategory === 'Noun' && conjugations.length > 0) {
            const doc = nlp(engWord).tag('Noun');
            const englishPlural = doc.nouns().toPlural().text('normal');
            if (englishPlural) addWord(englishPlural, conjugations[0], 'Noun');
        }

        // 4. Map Modals
        if (posCategory === 'Modal' && conjugations.length >= 4) {
            addWord(engWord, conjugations[0], 'Verb'); 
            
            const doc = nlp(engWord);
            const past = doc.verbs().toPastTense().text('normal');
            if (past) addWord(past, conjugations[1], 'Verb');
            
            // Explicit negative contractions to prevent compromise.js splits
            addWord(`${engWord} not`, conjugations[2], 'Verb');
            addWord(`${engWord}n't`, conjugations[2], 'Verb');
            if (engWord === 'can') addWord('cannot', conjugations[2], 'Verb');
            if (engWord === 'will') addWord("won't", conjugations[2], 'Verb');
            
            if (past) {
                addWord(`${past} not`, conjugations[3], 'Verb');
                addWord(`${past}n't`, conjugations[3], 'Verb');
            }
        }

        // 5. Map Auxiliaries (Copula "Be")
        if (posCategory === 'Copula' && engWord === 'be' && conjugations.length >= 12) {
            // Strict mapping: [bie, am, is, are, uas, uere, bign, bying, isn't, aren't, uasn't, ueren't]
            addWord('be', conjugations[0], 'Copula');
            addWord('am', conjugations[1], 'Copula');
            addWord('is', conjugations[2], 'Copula');
            addWord('are', conjugations[3], 'Copula');
            addWord('was', conjugations[4], 'Copula');
            addWord('were', conjugations[5], 'Copula');
            addWord('been', conjugations[6], 'Copula');
            addWord('being', conjugations[7], 'Copula');
            addWord('is not', conjugations[8], 'Copula');
            addWord("isn't", conjugations[8], 'Copula');
            addWord('are not', conjugations[9], 'Copula');
            addWord("aren't", conjugations[9], 'Copula');
            addWord('was not', conjugations[10], 'Copula');
            addWord("wasn't", conjugations[10], 'Copula');
            addWord('were not', conjugations[11], 'Copula');
            addWord("weren't", conjugations[11], 'Copula');
        }
    }

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(brain, null, 2));
    console.log(`✅ Brain compiled to ${OUTPUT_FILE}`);
    console.log(`📊 Loaded ${Object.keys(brain).length} total English forms!`);
}

compile();
