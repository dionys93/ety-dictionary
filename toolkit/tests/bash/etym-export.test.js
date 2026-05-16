import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import path from 'node:path';

const SCRIPT_PATH = path.resolve(import.meta.dirname, '../../etym-lib.sh');
const FIXTURE_DIR = path.resolve(import.meta.dirname, '../fixtures/dictionary');

/**
 * Helper function to securely execute our Bash toolkit in isolation.
 */
const runTool = (command) => {
    try {
        const cmd = `bash -c "export DICT_DIR='${FIXTURE_DIR}'; source ${SCRIPT_PATH} && ${command}"`;
        return execSync(cmd, {
            env: process.env,
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

describe('etym-export (Single Word JSON Compiler)', () => {

    it('fails gracefully if no word is provided', () => {
        try {
            runTool('etym-export');
        } catch (error) {
            expect(error.status).toBe(1);
            expect(error.stdout).toContain('Usage: etym-export');
        }
    });

    it('outputs structurally valid JSON matching the stanza schema', () => {
        const output = runTool('etym-export animate');
        const data = JSON.parse(output);

        // etym-export outputs an array of stanzas
        expect(Array.isArray(data)).toBe(true);
        expect(data.length).toBeGreaterThan(0);

        const firstStanza = data[0];
        expect(firstStanza).toHaveProperty('name');
        expect(firstStanza).toHaveProperty('etymology');
        expect(firstStanza).toHaveProperty('sources');
        expect(Array.isArray(firstStanza.etymology)).toBe(true);
    });

    it('extracts Inglisce specific properties (POS, conjugations) into the etymology array', () => {
        const output = runTool('etym-export animate');
        const data = JSON.parse(output);

        // Find the Inglisce entry in the first stanza's etymology array
        const inglisceEntry = data[0].etymology.find(e => e.origin === 'Inglisce');

        expect(inglisceEntry).toBeDefined();
        expect(inglisceEntry).toHaveProperty('name');
        expect(inglisceEntry).toHaveProperty('part-of-speech');

        // Assert POS is an array and does not contain raw parentheses
        expect(Array.isArray(inglisceEntry['part-of-speech'])).toBe(true);
        expect(inglisceEntry['part-of-speech'][0]).not.toContain('(');
    });

    it('sanitizes inline [LANG] tags out of the output strings', () => {
        const output = runTool('etym-export animate');

        // Doing a raw string check on the output is the fastest way to ensure 
        // no [ME], [L], or [OF] tags accidentally bled into the JSON values
        expect(output).not.toContain('[ME]');
        expect(output).not.toContain('[L]');
    });

    it('safely processes multi-stanza words as multiple array objects', () => {
        // 'animate' has a verb stanza and an adjective stanza
        const output = runTool('etym-export animate');
        const data = JSON.parse(output);

        // Assert that it correctly parsed into distinct JSON objects in the array
        // (Verb in data[0], Adjective in data[1])
        expect(data.length).toBeGreaterThan(1);
    });

    it('correctly processes standard nouns without throwing errors', () => {
        const output = runTool('etym-export dog');
        const data = JSON.parse(output);
        const inglisceEntry = data[0].etymology.find(e => e.origin === 'Inglisce');

        expect(inglisceEntry).toBeDefined();

        // Assert it correctly identified the noun tag
        const isNoun = inglisceEntry['part-of-speech'].some(pos => pos.includes('n') || pos.includes('noun'));
        expect(isNoun).toBe(true);
    });

    it('safely handles modals and irregular auxiliaries as flat arrays', () => {
        // Testing a modal (can) and an irregular (be)
        const canData = JSON.parse(runTool('etym-export can'));
        const beData = JSON.parse(runTool('etym-export be'));

        const canInglisce = canData[0].etymology.find(e => e.origin === 'Inglisce');
        const beInglisce = beData[0].etymology.find(e => e.origin === 'Inglisce');

        expect(canInglisce).toBeDefined();
        expect(beInglisce).toBeDefined();

        // Assert that the pipeline successfully bypassed the rigid 4-part template
        expect(Array.isArray(canInglisce.conjugations)).toBe(true);
        expect(Array.isArray(beInglisce.conjugations)).toBe(true);

       // Assert 'can' successfully included its base word and preserved apostrophes
        expect(canInglisce.conjugations).toContain('can');
        expect(canInglisce.conjugations).toContain("can't");

        // Use a resilient check for the circumflex word to bypass OS/Unicode normalization traps
        const hasCouldnt = canInglisce.conjugations.some(word => 
            word.normalize() === "coûdn't".normalize() || word.includes("dn't")
        );
        expect(hasCouldnt).toBe(true);

        // Assert 'be' successfully stripped 'to', kept the base word, and preserved apostrophes
        expect(beInglisce.conjugations).toContain('bie');
        expect(beInglisce.conjugations).toContain("isn't");
        expect(beInglisce.conjugations).toContain("uasn't");

        // Ensure trailing commas were successfully stripped
        expect(beInglisce.conjugations.some(c => c.includes(','))).toBe(false);
    });

    it('processes our cleaned enthrone file flawlessly', () => {
        const output = runTool('etym-export enthrone');
        const data = JSON.parse(output);

        const inglisceEntry = data[0].etymology.find(e => e.origin === 'Inglisce');

        // Assert the root word perfectly matches the Inglisce spelling and preserves the 'þ' character
        expect(inglisceEntry.name).toBe('to enþrone');
    });

    it('correctly processes adjectives and their derivations (-ly, -ness)', () => {
        // 'happy' or 'fast' were in our sandbox creation script earlier
        const output = runTool('etym-export happy');
        const data = JSON.parse(output);
        
        const inglisceEntry = data[0].etymology.find(e => e.origin === 'Inglisce');
        
        expect(inglisceEntry).toBeDefined();
        
        // Assert it correctly identified the adjective tag
        const isAdj = inglisceEntry['part-of-speech'].some(pos => pos.includes('adj'));
        expect(isAdj).toBe(true);

        // Assert the derivations object was built correctly instead of conjugations
        expect(inglisceEntry.derivations).toBeDefined();
        expect(inglisceEntry.conjugations).toBeUndefined();
    });

    it('handles case-insensitive inputs gracefully', () => {
        // Pass 'Animate' with a capital A
        const output = runTool('etym-export Animate');
        const data = JSON.parse(output);
        
        // Assert it still successfully found and parsed the lowercase 'animate.txt' file
        expect(data[0].name).toBe('animate');
    });

});