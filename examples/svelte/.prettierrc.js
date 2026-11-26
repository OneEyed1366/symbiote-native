module.exports = {
  arrowParens: 'avoid',
  singleQuote: true,
  trailingComma: 'all',
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
