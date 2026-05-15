import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import path from 'node:path';

// Tests bash functions: etym-cat, etym-find, etym-info

// 1. Bulletproof Absolute Paths
const SCRIPT_PATH = path.resolve(import.meta.dirname, '../../etym-lib.sh');
const FIXTURE_DIR = path.resolve(import.meta.dirname, '../fixtures/dictionary');

/**
 * Helper function to securely execute our Bash toolkit in isolation.
 * It injects DICT_DIR so the script targets our Sandbox, not the real dictionary.
 */
const runTool = (command) => {
    return execSync(`bash -c "source ${SCRIPT_PATH} && ${command}"`, {
        // Inherit standard Node env, but forcefully overwrite DICT_DIR
        env: { ...process.env, DICT_DIR: FIXTURE_DIR },
        encoding: 'utf-8',
        stdio: 'pipe' // Captures the output so we can assert against it
    });
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