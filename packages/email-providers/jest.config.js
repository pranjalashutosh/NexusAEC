/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.test.ts', '!src/**/index.ts'],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov'],
  moduleNameMapper: {
    '^@nexus-aec/shared-types$': '<rootDir>/../shared-types/src/index.ts',
    '^@nexus-aec/encryption$': '<rootDir>/../encryption/src/index.ts',
    '^@nexus-aec/secure-storage$': '<rootDir>/../secure-storage/src/index.ts',
    '^@nexus-aec/logger$': '<rootDir>/../logger/src/index.ts',
  },
};
