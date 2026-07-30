// brain-contract.test.js — Vitest wrapper around the awk → Node schema contract
//
// The actual assertions live in brain-contract.assertions.mjs (single source
// of truth, also runnable standalone via `node tests/node/brain-contract.assertions.mjs`
// or through tests/test-etym-parse.sh stage 5). This wrapper just surfaces each
// check as an individual Vitest case so `npm test` reports them granularly.

import { describe, it, expect } from 'vitest';
import { runContract } from './brain-contract.assertions.mjs';

const { checks, compiledCount, datasetCount } = runContract();

describe('awk → Node Schema Contract (golden JSONL through buildBrain)', () => {

    it(`compiles every golden record (${compiledCount}/${datasetCount})`, () => {
        expect(compiledCount).toBe(datasetCount);
    });

    for (const { label, ok } of checks) {
        it(label, () => {
            expect(ok).toBe(true);
        });
    }
});
