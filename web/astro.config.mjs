// web/astro.config.mjs
// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import { glyphDevApi } from './dev-tools/glyph-dev-server.mjs';

// https://astro.build/config
export default defineConfig({
  // Add this line to enable API endpoints:
  output: 'static',
  integrations: [react(), glyphDevApi()]
});