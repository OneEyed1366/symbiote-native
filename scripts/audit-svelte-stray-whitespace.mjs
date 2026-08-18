// Audits every .svelte file for whitespace that reaches a real native node.
// Costs nothing to run and catches what tsc and the compiler never will:
//   node scripts/audit-svelte-stray-whitespace.mjs [...roots]
//
// INSIDE one text node — Svelte trims a text node's leading/trailing whitespace but does not
// condense whitespace inside it (unlike Vue's compiler), so a sentence wrapped across source
// lines ships its literal newline + indent into the RCTText: the device renders a line break
// and a run of spaces mid-sentence.
//
// This checks the PIPELINE'S OUTPUT, not the author's source: it runs `collapseTextWhitespace()`
// first, exactly as svelte.config.js and metro-svelte-transformer.cjs do, and flags only what
// survives. Checking the source instead would report every sentence wrapped for readability —
// ~59 of them once the markup was written normally — none of which is a bug, which is how a
// gate turns into noise. What it still catches is the case that matters: a text node the
// preprocessor cannot fix, or a build where the preprocessor is not registered at all.
//
// BETWEEN siblings — this pass is GONE, deliberately (2026-08-19). It counted whitespace-only
// text nodes in the compiled from_tree([...]) array, back when each became a ShimText ->
// RCTRawText -> native shadow node. `dom-shim/text.ts` now maps a whitespace-only text node
// under a parent that cannot hold raw text to an anchor, so the gap never reaches Fabric and
// markup is written normally everywhere. A counter reporting thousands of hits none of which
// is a bug is noise, not hygiene. Mechanism: svelte-adapter-dom-shim skill §16b.

import { readFileSync } from 'node:fs';
import { globSync } from 'node:fs';
import { createRequire } from 'node:module';
import { relative } from 'node:path';

// pnpm keeps node_modules isolated per package, and `svelte` is a devDependency of
// adapters/svelte — not of the repo root — so resolve from there, not from this script.
const require = createRequire(new URL('../adapters/svelte/package.json', import.meta.url));
const { parse } = require('svelte/compiler');

// The built preprocessor, not the .ts source: this script is plain node with no TS loader, and
// the build output is what a consuming app actually runs.
const { collapseTextWhitespace } = await import(
  new URL(
    '../adapters/svelte/build/preprocessor/collapse-text-whitespace.js',
    import.meta.url,
  ).href
);
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
