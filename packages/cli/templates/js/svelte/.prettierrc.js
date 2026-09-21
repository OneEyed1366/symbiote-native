module.exports = {
  arrowParens: 'avoid',
  singleQuote: true,
  trailingComma: 'all',
  plugins: ['prettier-plugin-svelte'],
  // htmlWhitespaceSensitivity:'ignore' keeps prettier from re-encoding a gap between siblings as
  // a dangling `>` / split closing tag. Whitespace there is free — a whitespace-only text node
  // under a non-text parent becomes an anchor.
  overrides: [
    {
      files: '*.svelte',
      options: { parser: 'svelte', htmlWhitespaceSensitivity: 'ignore' },
    },
  ],
};
