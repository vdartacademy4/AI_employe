import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    setupFiles: ['./tests.setup.ts'],
    // Every suite points at the same `file:./test.db` (see tests.setup.ts).
    // Running files concurrently therefore mutates one SQLite database from
    // several connections at once, which leaks rows between suites and makes
    // assertions that count rows order-dependent. Serialise the files instead.
    fileParallelism: false,
  },
});
