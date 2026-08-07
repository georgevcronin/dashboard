export default {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  moduleNameMapper: {
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
  },
  transform: {
    '^.+\\.(jsx?|mjs)$': 'babel-jest',
  },
  testMatch: ['**/test/**/*.test.jsx'],
  testPathIgnorePatterns: ['/node_modules/', '/.claude/worktrees/'],
};
