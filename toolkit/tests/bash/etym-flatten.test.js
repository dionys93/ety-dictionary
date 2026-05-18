import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

// Point directly to your actual dictionary text files
const FIXTURE_DIR = path.resolve(__dirname, '../fixtures/dictionary');

// Save to a persistent, visible output directory that we WILL NOT delete
const OUT_DIR = path.resolve(__dirname, '../fixtures/flatten-out');

function runFlatten(args = '') {
    const cmd = `bash -c "export DICT_DIR=${FIXTURE_DIR} && source /workspaces/ety-dictionary/toolkit/config/env.sh && source /workspaces/ety-dictionary/toolkit/etym-lib.sh && etym-flatten ${FIXTURE_DIR} ${args}"`;
    return execSync(cmd, { encoding: 'utf-8' });
}

describe('etym-flatten (Real Output Generation)', () => {
    
    // Notice: There is no afterAll() cleanup hook here. 
    // The files will stay on your hard drive so you can measure them.

    it('generates physical, un-mocked files from your actual dictionary', () => {
        if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
        
        const tsvFile = path.join(OUT_DIR, 'master.tsv');
        const csvFile = path.join(OUT_DIR, 'master.csv');
        const jsonlFile = path.join(OUT_DIR, 'master.jsonl');

        // Execute the bash scripts and pipe the output to the files
        runFlatten(`--out ${tsvFile}`);
        runFlatten(`--csv --out ${csvFile}`);
        runFlatten(`--jsonl -o ${jsonlFile}`);

        // Read the actual JSONL file that was just written to the hard drive
        const jsonlContent = fs.readFileSync(jsonlFile, 'utf-8').trim().split('\n');
        
        // Basic sanity check to ensure the bash script actually wrote data
        expect(jsonlContent.length).toBeGreaterThan(0);
        
        // Log the exact location so you can click it and read the data
        console.log(`\n🔥 MEASURABLE OUTPUT GENERATED 🔥`);
        console.log(`JSONL File ready for transcription: ${jsonlFile}`);
        console.log(`Open this file in your editor to see exactly what transcribe.js will parse.\n`);
    });
});