export default {
  testEnvironment: 'node',
  // Required for ESM support (package has "type": "module")
  transform: {},
  // Only treat *.test.js files as suites so helper files under
  // __tests__/helpers are not mistaken for empty test suites.
  testMatch: ['**/__tests__/**/*.test.js'],
};
