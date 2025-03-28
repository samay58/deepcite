module.exports = {
  testEnvironment: 'jsdom',
  transform: {
    '^.+\\.(js|jsx|ts|tsx)$': 'babel-jest'
  },
  moduleNameMapper: {
    '^@handlers/(.*)$': '<rootDir>/src/handlers/$1',
    '^@extractors/(.*)$': '<rootDir>/src/extractors/$1',
    '^@utils/(.*)$': '<rootDir>/src/utils/$1'
  },
  setupFiles: ['./tests/setup.js'],
  transformIgnorePatterns: [
    '/node_modules/(?!.*\\.mjs$)'
  ],
  moduleFileExtensions: ['js', 'jsx', 'ts', 'tsx', 'json', 'node']
};
