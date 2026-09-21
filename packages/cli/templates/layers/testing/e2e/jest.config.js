/**
 * Jest config for the Detox e2e layer. Detox's runners are jest/mocha (no vitest), so jest is
 * scoped to e2e/ only.
 * @type {import('jest').Config}
 */
module.exports = {
  rootDir: '.',
  maxWorkers: 1,
  testTimeout: 120000,
  testMatch: ['**/*.test.ts'],
  testRunner: 'jest-circus/runner',
  globalSetup: 'detox/runners/jest/globalSetup',
  globalTeardown: 'detox/runners/jest/globalTeardown',
  testEnvironment: 'detox/runners/jest/testEnvironment',
  setupFilesAfterEnv: ['./setup.ts'],
  reporters: ['detox/runners/jest/reporter'],
  transform: {
    '\\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
  },
  verbose: true,
};
