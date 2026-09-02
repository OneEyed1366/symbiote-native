// The one line a tidy-up would "fix" into a re-export, and the failure that would cause is
// RELEASE-ONLY.
//
// `src/register.ts` installs the pressable host behavior by side effect. Metro's `inlineRequires`
// (production only) moves a `require` down to the first use of its binding as a VALUE, and a
// barrel's `export { X } from './x'` compiles to a lazy getter — so a re-exported register module
// whose names nobody uses as a value never evaluates, and the behavior is silently never
// registered. Dev builds are fine, tsc is fine, vitest is fine (it evaluates eagerly), and the
// bundle still CONTAINS the code. Only a Release build on a device shows it, as a Pressable that
// does not press.
//
// So this asserts the SHAPE of the barrel text, which is the only place the hazard is visible.
// CLAUDE.md's "never make correctness depend on a load-time side effect reached through a barrel"
// is the general rule; this is its one live instance in this adapter.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Comments are stripped first, and that is not fastidiousness: the barrel's own comment explains
// the hazard by QUOTING the forbidden form, so a naive text match fails on the very line that
// documents why the rule exists.
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

const BARREL = path.resolve(__dirname, 'index.ts');
const source = withoutComments(fs.readFileSync(BARREL, 'utf8'));

describe('the register module reaches the bundle as a side effect', () => {
  it('is imported bare', () => {
    expect(source).toMatch(/^import '\.\/register';$/m);
  });

  it('is NEVER re-exported — that is what makes the bare import lazy again', () => {
    expect(source).not.toMatch(/export\s[^;]*from\s+'\.\/register'/);
  });

  it('exports nothing itself, so no re-export can be tempting', () => {
    const registerSource = withoutComments(
      fs.readFileSync(path.resolve(__dirname, 'register.ts'), 'utf8'),
    );
    expect(registerSource).not.toMatch(/^export\s/m);
  });
});
