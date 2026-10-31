import { defineConfig } from 'vitest/config'

// jsdom, not node: this SDK IS the browser — postMessage, MessageEvent and document are what it
// operates on, and a node environment would leave every function either untested or stubbed into
// meaninglessness.
export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
  },
})
