module.exports = {
  arrowParens: 'avoid',
  singleQuote: true,
  trailingComma: 'all',
  plugins: ['prettier-plugin-svelte'],
  // htmlWhitespaceSensitivity:'ignore' keeps prettier from re-encoding a gap between
  // siblings as a dangling `>` / split closing tag. Whitespace there is free now — the
  // shim turns a whitespace-only text node under a non-text parent into an anchor
  // (svelte-adapter-dom-shim §16b) — and the repo root sets the same option.
  overrides: [
    {
      files: '*.svelte',
      options: { parser: 'svelte', htmlWhitespaceSensitivity: 'ignore' },
    },
  ],
};
