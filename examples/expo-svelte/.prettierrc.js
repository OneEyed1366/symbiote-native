module.exports = {
  arrowParens: 'avoid',
  singleQuote: true,
  trailingComma: 'all',
  // Needed for the .svelte files under screens/ — prettier has no built-in svelte parser.
  // examples/svelte carries the identical pair; without it the repo-root format sweep aborts
  // with `No parser could be inferred` (.claude/rules/examples-in-prettier-sweep.md).
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
