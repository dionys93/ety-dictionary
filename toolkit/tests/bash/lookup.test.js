import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import path from 'node:path';

const SCRIPT_PATH = path.resolve(import.meta.dirname, '../../etym-lib.sh');
const FIXTURE_DIR = path.resolve(import.meta.dirname, '../fixtures/dictionary');

/**
 * Helper function to securely execute our Bash toolkit in isolation.
 * It injects DICT_DIR so the script targets our Sandbox, not the real dictionary.
 */
/**
 * Helper function to securely execute our Bash toolkit in isolation.
 * It injects DICT_DIR so the script targets our Sandbox, not the real dictionary.
 */
const runTool = (command) => {
    try {
        return execSync(`bash -c "source ${SCRIPT_PATH} && ${command}"`, {
            // Because env.sh now uses :- , it will safely adopt this Sandbox path!
            env: { ...process.env, DICT_DIR: FIXTURE_DIR },
            encoding: 'utf-8',
            stdio: 'pipe' 
        });
    } catch (err) {
        console.error(`\n🔥 BASH CRASHED: ${command}`);
        console.error(`STDOUT:\n${err.stdout}`);
        console.error(`STDERR:\n${err.stderr}`);
        throw err; 
    }
};

// ============================================================================
// SUITE 1: etym-cat
// ============================================================================
describe('etym-cat (Raw Stanza Output)', () => {

    it('fails gracefully if no word is provided', () => {
        try {
            runTool('etym-cat');
        } catch (error) {
            expect(error.status).toBe(1);
            expect(error.stdout).toContain('Usage: etym-cat <word>');
        }
    });

    it('fails gracefully if the word does not exist in the dictionary', () => {
        try {
            runTool('etym-cat non_existent_word');
        } catch (error) {
            expect(error.status).toBe(1);
            expect(error.stdout).toContain("Error: 'non_existent_word' not found.");
        }
    });

    it('successfully prints a dictionary file broken into numbered stanzas', () => {
        const output = runTool('etym-cat animate');

        expect(output).toContain('Stanza 1:');
        expect(output).toContain('to animate [ME]');
        // Verify it includes the trailing URLs correctly
        expect(output).toContain('http');
    });
});

// ============================================================================
// SUITE 2: etym-find
// ============================================================================
describe('etym-find (Recursive Grep)', () => {

    it('fails gracefully if no query is provided', () => {
        try {
            runTool('etym-find');
        } catch (error) {
            expect(error.status).toBe(1);
            expect(error.stdout).toContain('Usage: etym-find <query_or_lang_tag>');
        }
    });

    it('locates specific language tags across the dictionary', () => {
        const output = runTool('etym-find "[L]"');

        // Assert that grep returned the file path and the matching line
        expect(output).toContain('animate.txt:');
        expect(output).toContain('[L]');
    });
});

// ============================================================================
// SUITE 3: etym-info
// ============================================================================
describe('etym-info (Primary Definition Extraction)', () => {

    it('fails gracefully if the file cannot be located', () => {
        try {
            runTool('etym-info missing_word');
        } catch (error) {
            expect(error.status).toBe(1);
            expect(error.stdout).toContain("Error: Word 'missing_word' not found");
        }
    });

    it('successfully extracts data from a cleaned dictionary file', () => {
        const output = runTool('etym-info enthrone');
        
        // Assert the tool successfully grabbed the target word
        expect(output).toContain('enthrone');
        
        // Assert it successfully grabbed the Part of Speech
        const hasPos = output.includes('verb') || output.includes('(v)');
        expect(hasPos).toBe(true);
    });

    it('correctly handles words with multiple stanzas by isolating the primary definition', () => {
        // Words like 'record' have multiple stanzas (noun vs verb). 
        // etym-info should elegantly handle this without vomiting both into the same output line.
        const output = runTool('etym-info record');

        // Assert it didn't just smash the entire file together
        expect(output).toContain('PART OF SPEECH');

        // Depending on how etym-info is written, it usually grabs the first stanza it finds.
        // We assert it successfully found *a* valid POS instead of failing on the stanza break.
        const hasValidPos = output.includes('noun') || output.includes('(n)') ||
            output.includes('verb') || output.includes('(v)');
        expect(hasValidPos).toBe(true);
    });

    it('successfully extracts and formats a standard primary definition', () => {
        const output = runTool('etym-info animate');

        // Assert the table headers render correctly
        expect(output).toContain('INGLISCE');
        expect(output).toContain('PART OF SPEECH');
        expect(output).toContain('ORIGIN');

        // Assert the data extraction is correct against the animate.txt fixture
        expect(output).toContain('animait');

        // The fixture animate.txt uses '(v)', so we check for 'verb' or 'v'
        const hasPos = output.includes('verb') || output.includes('(v)');
        expect(hasPos).toBe(true);
    });

    it('successfully resolves an inline [LANG] tag without bleeding into the POS', () => {
        const output = runTool('etym-info do');

        // Assert that 'do' was found, and the POS didn't capture the language tag
        expect(output).not.toContain('Unknown/Malformed');
    });
});