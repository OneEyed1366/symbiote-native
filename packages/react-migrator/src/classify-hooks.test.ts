// `classifyPackageHooks` over the real sources of two queue packages, pinned in the catalog
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { HOOK_KIND, classifyPackageHooks } from './classify-hooks';

const corpusSource = (name: string): string =>
  fileURLToPath(new URL(`../node_modules/${name}/src`, import.meta.url));

describe('classifyPackageHooks', () => {
  it('sorts the public hooks of react-native-safe-area-context', () => {
    const report = classifyPackageHooks(corpusSource('react-native-safe-area-context'));

    expect(report.parseErrors).toEqual([]);
    expect(report.totals.public).toEqual({ context: 2, composite: 1 });
  });

  it('counts only what src/index re-exports as public in react-native-keyboard-controller', () => {
    const report = classifyPackageHooks(corpusSource('react-native-keyboard-controller'));

    expect(report.totals.public).toEqual({
      composite: 5,
      reanimated: 3,
      context: 1,
      subscription: 1,
      'effect-only': 1,
    });
  });

  it('sees an aliased reanimated import as the hook it aliases', () => {
    const report = classifyPackageHooks(corpusSource('react-native-keyboard-controller'));
    const wrapper = report.entries.find(
      (hook) => hook.name === 'useAnimatedProps' && hook.file === 'reanimated.native.ts',
    );

    expect(wrapper?.kind).toBe(HOOK_KIND.reanimated);
    expect(wrapper?.isPublic).toBe(false);
  });

  it('gives a body with no hook calls its own kind instead of derived', () => {
    const report = classifyPackageHooks(corpusSource('react-native-keyboard-controller'));
    const stubs = report.entries.filter((hook) => hook.file === 'reanimated.ts');

    expect(stubs.map((hook) => hook.kind)).toEqual([HOOK_KIND.noHooks, HOOK_KIND.noHooks]);
  });
});
