/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  // The package is ESM ("type": "module") and the source uses import.meta.url,
  // which cannot be transpiled to CommonJS — so Jest runs in ESM mode via
  // NODE_OPTIONS=--experimental-vm-modules (see the "test" script). @swc/jest
  // emits ESM; moduleNameMapper below strips the .js import specifiers so they
  // resolve to the .ts sources here.
  //
  // ESM mode means jest.mock() no longer hoists: test files must
  //   import { jest } from '@jest/globals';
  // and use jest.unstable_mockModule(...) + a dynamic import() of the module
  // under test for any module mocks. (See ESM_TESTING.md.)
  extensionsToTreatAsEsm: ['.ts'],
  transform: {
    '^.+\\.ts$': [
      '@swc/jest',
      {
        jsc: {
          parser: { syntax: 'typescript', decorators: true },
          transform: { legacyDecorator: true, decoratorMetadata: true },
          target: 'es2022',
          keepClassNames: true,
        },
        module: { type: 'es6' },
      },
    ],
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
  // Map .js imports to .ts files for ESM compatibility
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.test.ts', '!src/index.ts'],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov'],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
  verbose: true,
};
