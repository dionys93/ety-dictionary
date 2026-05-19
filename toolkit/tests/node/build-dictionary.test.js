import { describe, it, expect } from 'vitest';
import { compile } from '../../scripts/build-dictionary.js';


describe('Node Compiler: translationBrain', () => {
    it('correctly maps the irregular verb "be" into all 28 structural forms', () => {
        // Run compiler against the test_master_dataset.jsonl
        // Assert that brain['be'] exists and has 'Verb' and 'Copula'
        // Assert that brain["isn't"] exists and maps correctly
    });

    it('prevents polluted data from bleeding into the dictionary keys', () => {
        // Assert that brain["to"] does not exist (from the enthrone bug)
        // Assert that brain["against (prep)"] is cleanly parsed as "against"
    });
});
