module.exports = {
  arrowParens: 'avoid',
  singleQuote: true,
  trailingComma: 'all',
  // Needed for the .svelte files under screens/ — prettier has no built-in svelte parser.
  // examples/svelte carries the identical pair; without it the repo-root format sweep aborts
  // with `No parser could be inferred` (.claude/rules/examples-in-prettier-sweep.md).
  plugins: ['prettier-plugin-svelte'],
  // `htmlWhitespaceSensitivity: 'ignore'` keeps prettier from re-encoding a gap between
  // siblings as a dangling `>` or a split closing tag, as the repo root does
  // Whitespace there is free: a whitespace-only text node under a non-text parent is dropped
  overrides: [
    {
      files: '*.svelte',
      options: { parser: 'svelte', htmlWhitespaceSensitivity: 'ignore' },
    },
  ],
};
