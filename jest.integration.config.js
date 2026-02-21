module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  displayName: 'Integration Tests',
  roots: ['<rootDir>/tests/integration'],
  testMatch: [
    '<rootDir>/tests/integration/baseviews/**/*.test.ts'
  ],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  setupFilesAfterEnv: ['<rootDir>/tests/test-setup.ts'],
  moduleNameMapper: {
    '^obsidian$': '<rootDir>/tests/__mocks__/obsidian.ts'
  },
  // No integration tests are currently defined for Base Views.
  passWithNoTests: true,
  testTimeout: 30000,
  clearMocks: true,
  restoreMocks: true,
  collectCoverageFrom: [
    'src/bases/**/*.ts',
    'src/integrations/**/*.ts',
    '!src/**/*.d.ts',
    '!tests/**/*'
  ]
};
