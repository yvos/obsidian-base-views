module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/tests'],
  testMatch: [
    '<rootDir>/tests/unit/services/i18nService.test.ts',
    '<rootDir>/tests/unit/bases/**/*.test.ts',
    '<rootDir>/tests/unit/integrations/**/*.test.ts'
  ],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  setupFilesAfterEnv: ['<rootDir>/tests/test-setup.ts'],
  moduleNameMapper: {
    '^obsidian$': '<rootDir>/tests/__mocks__/obsidian.ts',
    '^chrono-node$': '<rootDir>/tests/__mocks__/chrono-node.ts',
    '^rrule$': '<rootDir>/tests/__mocks__/rrule.ts',
    '^date-fns$': '<rootDir>/tests/__mocks__/date-fns.ts'
  },
  collectCoverageFrom: [
    'src/services/**/*.ts',
    'src/utils/**/*.ts',
    '!src/services/PriorityManager.ts',
    '!src/services/StatusManager.ts',
    '!src/services/FieldMapper.ts',
    '!src/**/*.d.ts',
    '!tests/**/*'
  ],
  coverageReporters: ['text', 'lcov', 'html'],
  testTimeout: 10000,
  clearMocks: true,
  restoreMocks: true
};
