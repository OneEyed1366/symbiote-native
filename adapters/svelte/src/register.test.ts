// The press-behavior registration is reachable only if `index.ts` imports it in ONE exact shape,
// and that shape is a syntactic property — so this asserts on the barrel's source rather than by
// importing it.
//
// Two reasons it is written this way rather than as a runtime check. The barrel re-exports
// `.svelte` files and no vite-plugin-svelte is wired into this repo's vitest config, so importing
// it from a test fails to parse at all. And the failure the import shape exists to prevent —
// Metro's `inlineRequires` turning a barrel re-export into a lazy getter that never evaluates — is
// invisible to a runtime check anyway, because vitest evaluates ESM eagerly: `export * from
// './register'` would pass a `hasHostBehaviors()` assertion while being dead in a release bundle.
//
// So the observable property IS the syntax, and this pins it: a bare side-effect import, never a
// re-export, never beside a re-export of the same specifier (Babel merges two imports of one
// specifier into a single dependency and the merged one stays lazy).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// COMMENTS STRIPPED BEFORE MATCHING, and this is not tidiness. The comment beside the import in
// `index.ts` explains the hazard, and the clearest way to explain it is to QUOTE the forbidden
// form — at which point a test matching raw text fails on the explanation rather than on the code.
// Solid hit exactly that. The alternative, wording the comment so it never names what it forbids,
// makes the comment worse to protect the test.
function withoutComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

const BARREL = withoutComments(
  readFileSync(join(__dirname, 'index.ts'), 'utf8'),
);
const SPECIFIER = './register';

describe('the adapter barrel', () => {
  it('imports the registration for its side effect', () => {
    expect(BARREL).toContain(`import '${SPECIFIER}';`);
  });

  // why: `export * from './register'` and `export { x } from './register'` both compile to a lazy
  // getter under inlineRequires. Either one, alone or beside the bare import, makes the
  // registration release-dead.
  it('never re-exports it, in any form', () => {
    expect(BARREL).not.toMatch(
      new RegExp(String.raw`export[\s\S]{0,80}from\s*'\.\/register'`),
    );
  });
});
