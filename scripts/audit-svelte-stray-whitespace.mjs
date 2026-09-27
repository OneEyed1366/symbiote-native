// Audits every .svelte file for whitespace that reaches a real native node — costs nothing to run,
// catches what tsc/the compiler never will:
//   node scripts/audit-svelte-stray-whitespace.mjs [...roots]

// INSIDE one text node — Svelte trims a text node's leading/trailing whitespace but does not
// condense whitespace inside it, so a sentence wrapped across source lines ships its literal
// newline+indent into the RCTText: the device renders a line break and mid-sentence spaces.

// Checks the PIPELINE'S OUTPUT (after `collapseTextWhitespace()`, same as svelte.config.js), not
// the source — checking source would flag every readability-wrapped sentence as a false positive.
// Catches only what survives: a text node the preprocessor can't fix, or an unregistered build.

// BETWEEN siblings — no longer checked: `dom-shim/text.ts` maps a whitespace-only text node under
// a parent that can't hold raw text to an anchor, so the gap never reaches Fabric (mechanism:
// svelte-adapter-dom-shim skill §16b).

import { readFileSync } from 'node:fs';
import { globSync } from 'node:fs';
import { createRequire } from 'node:module';
import { relative } from 'node:path';

// pnpm keeps node_modules isolated per package, and `svelte` is a devDependency of
// adapters/svelte — not of the repo root — so resolve from there, not from this script.
const require = createRequire(
  new URL('../adapters/svelte/package.json', import.meta.url),
);
const { parse } = require('svelte/compiler');

// The built preprocessor, not the .ts source: this script is plain node with no TS loader, and
// the build output is what a consuming app actually runs. A missing build would mean auditing
// raw source — every normally-formatted file reported as an offender — so fail loudly instead of
// producing a wrong report.
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
      'Run `pnpm typecheck` (which emits build/) first — auditing raw source would report every\n' +
      'normally-formatted file as an offender.',
  );
  process.exit(2);
}
const collapse = collapseTextWhitespace();

// Walks any parsed node shape looking for Text nodes whose real content spans source lines.
// Reads the AST through plain structural checks rather than a pinned type, the same discipline
// adapters/svelte/src/preprocessor/forbid-special-elements.ts uses on the same parse() output.
function collectWrappedText(node, found) {
  if (Array.isArray(node)) {
    for (const child of node) collectWrappedText(child, found);
    return found;
  }
  if (typeof node !== 'object' || node === null) return found;
  if (
    node.type === 'Text' &&
    typeof node.data === 'string' &&
    node.data.trim().includes('\n')
  ) {
    found.push(node.data.trim().replace(/\s+/g, ' ').slice(0, 60));
  }
  for (const value of Object.values(node)) collectWrappedText(value, found);
  return found;
}

// `packages/**` is in the default set on purpose — omitting it silently under-scans (slider and
// navigation's .svelte files went unaudited until someone remembered to pass a root), and a
// default that silently under-scans reads as "clean", which is worse than no default at all.
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
  for (const span of spans) console.log(`     "${span}…"`);
}

console.log(
  `\n${files.length} files scanned · ${wrapped.length} files / ${wrappedTotal} wrapped text nodes`,
);
process.exit(wrappedTotal > 0 ? 1 : 0);
