// Svelte renders through `svelte/renderer` onto engine nodes, so no DOM emulation is left to name
// Two exceptions stay on purpose: the generated release notes and the local working ledger
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const KEPT_AS_HISTORY = new Set([
  'adapters/svelte/CHANGELOG.md',
  '.docs/svelte-custom-renderer-ledger.md',
]);

// Files that cover another subject and name Svelte beside the word
const OTHER_MEANING = new Set(['tests/svelte-adapter-has-no-shim.test.ts']);

// Names fixed by svelte2tsx, which `scripts/emit-svelte-declarations.mjs` has to pass as they are
const SVELTE2TSX_API_NAMES = /svelteShimsPath|svelte-shims-v4\.d\.ts/g;

// The names the emulation was built from, which can sit on a line that never says Svelte
const REMOVED_EMULATION_NAME =
  /dom-shim|\b(is)?Shim(Element|Node|Text|Comment)\b/;

const MAX_LISTING_BYTES = 67_108_864;
const SHIM_WORD = /shim/i;
const SVELTE_WORD = /svelte/i;
const BINARY_OR_BUILT = /(^|\/)(node_modules|build|Pods|ios|android)\//;
const TEXT_FILE = /\.(ts|tsx|js|cjs|mjs|svelte|md|mdx|json|yml|yaml|css)$/;

function workingFiles(): string[] {
  const output = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard'],
    { encoding: 'utf8', maxBuffer: MAX_LISTING_BYTES },
  ).trim();
  const paths = output.split('\n').filter(path => path !== '');
  return paths.filter(
    path =>
      existsSync(path) &&
      TEXT_FILE.test(path) &&
      !BINARY_OR_BUILT.test(path) &&
      !KEPT_AS_HISTORY.has(path) &&
      !OTHER_MEANING.has(path),
  );
}

function linesWith(path: string, matches: (line: string) => boolean) {
  return readFileSync(path, 'utf8')
    .split('\n')
    .map((text, index) => ({ at: `${path}:${index + 1}`, text }))
    .filter(({ text }) => matches(text));
}

describe('nothing Svelte is named after a shim', () => {
  const files = workingFiles();

  it('no path of the Svelte adapter or its example carries the word', () => {
    const named = files.filter(
      path =>
        SHIM_WORD.test(path) &&
        (path.startsWith('adapters/svelte/') ||
          path.startsWith('examples/svelte/')),
    );
    expect(named).toEqual([]);
  });

  it('no line inside the Svelte adapter or its example carries the word', () => {
    const roots = ['adapters/svelte/', 'examples/svelte/'];
    const hits = files
      .filter(path => roots.some(root => path.startsWith(root)))
      .flatMap(path => linesWith(path, line => SHIM_WORD.test(line)));
    expect(hits.map(hit => hit.at)).toEqual([]);
  });

  it('no line anywhere pairs the word with Svelte', () => {
    const hits = files.flatMap(path =>
      linesWith(
        path,
        line =>
          SHIM_WORD.test(line.replace(SVELTE2TSX_API_NAMES, '')) &&
          SVELTE_WORD.test(line),
      ),
    );
    expect(hits.map(hit => hit.at)).toEqual([]);
  });

  it('no line anywhere names a class or module of the removed DOM emulation', () => {
    const hits = files.flatMap(path =>
      linesWith(path, line => REMOVED_EMULATION_NAME.test(line)),
    );
    expect(hits.map(hit => hit.at)).toEqual([]);
  });
});
