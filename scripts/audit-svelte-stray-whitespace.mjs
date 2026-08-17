// Audits every .svelte file for the two ways stray whitespace reaches a real native node.
// Costs nothing to run and catches what tsc and the compiler never will:
//   node scripts/audit-svelte-stray-whitespace.mjs [...roots]
//
// BETWEEN siblings (svelte-adapter-dom-shim skill §16) — whitespace separating two sibling
// nodes survives Svelte's clean_nodes pass as a single-space TEXT node, which here becomes a
// real ShimText -> RCTRawText engine node -> native shadow node. Inside a non-Text parent that
// is also an invalid Fabric child. Detected in the compiled from_tree([...]) array.
//
// INSIDE one text node — a different bug, same cause. Svelte trims a text node's leading/
// trailing whitespace but does not condense whitespace inside it (unlike Vue's compiler), so a
// sentence wrapped across source lines ships its literal newline + indent into the RCTText: the
// device renders a line break and a run of spaces mid-sentence. Not caught by the §16 check
// (that one only sees text nodes that are ENTIRELY whitespace), so it's a separate pass.
//
// BOTH passes run on PREPROCESSED source, which is the only thing that makes this audit mean
// anything. `collapseTextWhitespace()` is registered in every svelte.config.js, so it is part of
// the real build: it deletes a whitespace-only node that spans a newline and collapses a wrapped
// sentence. Auditing raw source reports both shapes as offences even though the build fixes them,
// and that false positive is what forced .svelte markup here to be written packed edge-to-edge for
// a while. What survives preprocessing is the genuinely uncaught case: a whitespace-only gap
// between two siblings on ONE line (`<View><A /> <B /></View>`), which the preprocessor cannot
// tell from an intentional inline space.

import { readFileSync } from 'node:fs';
import { globSync } from 'node:fs';
import { createRequire } from 'node:module';
import { relative } from 'node:path';

// pnpm keeps node_modules isolated per package, and `svelte` is a devDependency of
// adapters/svelte — not of the repo root — so resolve from there, not from this script.
const require = createRequire(new URL('../adapters/svelte/package.json', import.meta.url));
const { compile, parse, preprocess } = require('svelte/compiler');

// The package's own `./collapse-text-whitespace` export points at the .ts source for in-repo
// consumers (Metro and tsc read live TS), which plain node cannot load — so reach for the build
// output. Missing build = auditing raw source = every readable file reported as an offender, so
// this fails loudly rather than producing a wrong report.
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
  if (node.type === 'Text' && typeof node.data === 'string' && node.data.trim().includes('\n')) {
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
    : ['adapters/svelte/src', 'packages/*/src', 'examples/svelte', 'examples/expo-svelte']
).map(root => `${root}/**/*.svelte`);

const files = patterns.flatMap(pattern => globSync(pattern, { exclude: ['**/node_modules/**'] }));

let total = 0;
let wrappedTotal = 0;
const offenders = [];
const wrapped = [];

for (const file of files.sort()) {
  const raw = readFileSync(file, 'utf8');
  const { code: source } = await preprocess(raw, collapse, { filename: file });
  // Same options svelte.config.js uses — `fragments: 'tree'` is what emits the from_tree([...])
  // array the stray single-space entries show up in.
  const result = compile(source, {
    generate: 'client',
    filename: file,
    fragments: 'tree',
    css: 'external',
  });
  const stray = result.js.code.match(/,\s*'\s+'\s*,/g) ?? [];
  if (stray.length > 0) {
    total += stray.length;
    offenders.push({ file: relative(process.cwd(), file), count: stray.length });
  }

  const spans = collectWrappedText(parse(source, { filename: file, modern: true }), []);
  if (spans.length > 0) {
    wrappedTotal += spans.length;
    wrapped.push({ file: relative(process.cwd(), file), spans });
  }
}

console.log('between siblings (a whole text node of whitespace):');
for (const { file, count } of offenders.sort((a, b) => b.count - a.count)) {
  console.log(`${String(count).padStart(3)}  ${file}`);
}

console.log('\ninside one text node (a sentence wrapped across source lines):');
for (const { file, spans } of wrapped.sort((a, b) => b.spans.length - a.spans.length)) {
  console.log(`${String(spans.length).padStart(3)}  ${file}`);
  for (const span of spans) console.log(`     "${span}…"`);
}

console.log(
  `\n${files.length} files scanned · ${offenders.length} files / ${total} stray separators` +
    ` · ${wrapped.length} files / ${wrappedTotal} wrapped text nodes`,
);
process.exit(total + wrappedTotal > 0 ? 1 : 0);
