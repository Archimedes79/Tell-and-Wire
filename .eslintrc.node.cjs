// `npm run lint` for graph/ and backend/ (the page has its own, frontend/.eslintrc.cjs).
// Type errors are `typecheck`'s job; this is for what the compiler does not see --
// above all a promise nobody waits for: in a Node server, an unhandled rejection
// ends the process.
module.exports = {
  root: true,
  env: { node: true, es2022: true },
  parser: '@typescript-eslint/parser',
  parserOptions: { project: ['./graph/tsconfig.json', './backend/tsconfig.json'], tsconfigRootDir: __dirname },
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  rules: {
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
    '@typescript-eslint/no-floating-promises': 'error',
    '@typescript-eslint/no-misused-promises': 'error',
  },
  // A test stubs what it fakes loosely: `any` for a JSON body, an async handler for a stub server.
  overrides: [{ files: ['*.test.ts'], rules: { '@typescript-eslint/no-explicit-any': 'off', '@typescript-eslint/no-misused-promises': 'off' } }],
};
