// Audits every .svelte file for whitespace that reaches a real native node
// It costs nothing to run and catches what tsc and the compiler never will
//   node scripts/audit-svelte-stray-whitespace.mjs [...roots]

// INSIDE one text node: Svelte trims a text node's edges but not the whitespace within it
// So a sentence wrapped across source lines ships its newline and indent into the `RCTText`
// and the device renders a line break and mid-sentence spaces

// Checks the pipeline's output (after `collapseTextWhitespace()`, as `svelte.config.js` does)
// Source would flag every readability-wrapped sentence as a false positive
// It catches only what survives: a text node the preprocessor cannot fix, or an unregistered build

// BETWEEN siblings is no longer checked: the renderer maps a whitespace-only text node under a
// parent that cannot hold raw text to an anchor, so the gap never reaches Fabric

import { readFileSync } from 'node:fs';
import { globSync } from 'node:fs';
import { createRequire } from 'node:module';
import { relative } from 'node:path';

// `svelte` is a `devDependency` of `adapters/svelte` and not of the repo root, and pnpm isolates
// node_modules per package, so it resolves from there
const require = createRequire(
  new URL('../adapters/svelte/package.json', import.meta.url),
);
const { parse } = require('svelte/compiler');

// The built preprocessor, as this script is plain node with no TS loader, and an app runs the build
// A missing build would flag every normally-formatted file, so fail loudly instead
const COLLAPSE_BUILD = new URL(
  '../adapters/svelte/build/preprocessor/collapse-text-whitespace.js',
  import.meta.url,
);
let collapseTextWhitespace;
try {
  ({ collapseTextWhitespace } = await import(COLLAPSE_BUILD.href));
} catch {
  console.error(
    'audit-svelte-stray-whitespace: adapters/svelte build output missing.\n' +
      'Run `pnpm typecheck` (which emits build/) first, as auditing raw source would report every\n' +
      'normally-formatted file as an offender.',
  );
  process.exit(2);
}
const collapse = collapseTextWhitespace();

const TEXT_NODE_TYPE = 'Text';

// The fields of a modern Svelte AST node that hold child nodes or a fragment of them
const CHILD_FIELDS = [
  'fragment',
  'nodes',
  'consequent',
  'alternate',
  'body',
  'fallback',
  'pending',
  'then',
  'catch',
];

// Walks the AST by those fields for Text nodes whose real content spans source lines
// The shape is read with plain structural checks, as `forbid-special-elements.ts` does
function collectWrappedText(node, found) {
  if (Array.isArray(node)) {
    for (const child of node) collectWrappedText(child, found);
    return found;
  }
  if (typeof node !== 'object' || node === null) return found;
  if (
    node.type === TEXT_NODE_TYPE &&
    typeof node.data === 'string' &&
    node.data.trim().includes('\n')
  ) {
    found.push(node.data.trim().replace(/\s+/g, ' ').slice(0, 60));
  }
  for (const field of CHILD_FIELDS) collectWrappedText(node[field], found);
  return found;
}

// `packages/*/src` is in the default set on purpose, as omitting it silently under-scans
// A default that under-scans reads as clean, which is worse than no default at all
const roots = process.argv.slice(2);
const patterns = (
  roots.length > 0
    ? roots
    : [
        'adapters/svelte/src',
        'packages/*/src',
        'examples/svelte',
        'examples/expo-svelte',
      ]
).map(root => `${root}/**/*.svelte`);

const files = patterns.flatMap(pattern =>
  globSync(pattern, { exclude: ['**/node_modules/**'] }),
);

let wrappedTotal = 0;
const wrapped = [];

for (const file of files.sort()) {
  const source = collapse.markup({
    content: readFileSync(file, 'utf8'),
    filename: file,
  }).code;
  const spans = collectWrappedText(
    parse(source, { filename: file, modern: true }),
    [],
  );
  if (spans.length > 0) {
    wrappedTotal += spans.length;
    wrapped.push({ file: relative(process.cwd(), file), spans });
  }
}

console.log('inside one text node (a sentence wrapped across source lines):');
for (const { file, spans } of wrapped.sort(
  (a, b) => b.spans.length - a.spans.length,
)) {
  console.log(`${String(spans.length).padStart(3)}  ${file}`);
  for (const span of spans) console.log(`     "${span}..."`);
}

console.log(
  `\n${files.length} files scanned, ${wrapped.length} files / ${wrappedTotal} wrapped text nodes`,
);
process.exit(wrappedTotal > 0 ? 1 : 0);
