// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

// https://astro.build/config
export default defineConfig({
  // Add this line to enable API endpoints:
  output: 'static',
  integrations: [react()]
});