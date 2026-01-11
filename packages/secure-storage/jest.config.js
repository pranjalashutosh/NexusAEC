/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.test.ts'],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov'],
  verbose: true,
  moduleNameMapper: {
    '^@nexus-aec/encryption$': '<rootDir>/../encryption/src/index.ts',
    '^@nexus-aec/shared-types$': '<rootDir>/../shared-types/src/index.ts',
  },
};

