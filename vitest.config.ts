import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts'],
    // Modules under test import lib/anthropic, whose client constructor
    // requires a key at import time; unit tests never call the API.
    env: { ANTHROPIC_API_KEY: 'test-key' },
  },
});
