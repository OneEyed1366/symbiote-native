// The barrel must reach `./register` as a SIDE EFFECT and never as a re-export. Metro's production
// `inlineRequires` moves a `require()` down to the first place its binding is used as a VALUE, and
// a barrel's `export { X } from './x'` compiles to a lazy getter — so a re-exported registration
// module never evaluates in a RELEASE build, and nothing anywhere goes red. A bare import placed
// beside a re-export of the same specifier is merged into that one lazy dependency and fails the
// same way, which is why both halves are asserted.
//
// The assertion reads the barrel's SOURCE rather than its runtime behaviour on purpose: under
// vitest every module is evaluated eagerly, so the failure this guards cannot be reproduced by
// importing anything. Comments are stripped first — the explanation next to the import quotes the
// forbidden form, and matching raw text fails on that quote rather than on the code.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const BARREL = new URL('./index.ts', import.meta.url).pathname;

function sourceWithoutComments(): string {
  return readFileSync(BARREL, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

describe('vue barrel', () => {
  it('imports ./register for its side effect', () => {
    expect(sourceWithoutComments()).toMatch(/^import '\.\/register';$/m);
  });

  it('never re-exports ./register', () => {
    expect(sourceWithoutComments()).not.toMatch(/export[^\n]*'\.\/register'/);
  });
});
