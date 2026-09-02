// A LOWERED primitive must apply every prop fold its WRAPPER applies.
//
// THE FAILURE THIS EXISTS FOR. A wrapper's component body is where the per-primitive prop folds
// live — TextInput's W3C aliases (`inputMode` -> `keyboardType`, `readOnly` -> `editable`),
// Pressable's `disabled` -> `accessibilityState`. Lowering deletes the body. Every fold it held is
// then silently dropped: the raw alias reaches Fabric as a key no ViewConfig declares, which throws
// nothing, logs nothing and renders nothing — so `inputMode="numeric"` produces the default
// keyboard on a device and a disabled button announces itself as enabled, with `tsc` green and
// every suite passing. Three such folds were live at once on 2026-08-31, found by running this
// comparison by hand rather than by any test.
//
// WHY THE ORACLE IS IMPORTS AND NOT PAYLOADS. The honest oracle is "wrapper and lowered element
// commit the same payload for the same props", and it is not reachable from here: rendering a
// wrapper needs its framework, and there are five of them. What IS reachable is that both paths
// call the same shared fold — every fold lives in `@symbiote-native/components` precisely because
// all five adapters share it. So this asks the weaker question that a file listing can answer, and
// the weaker question caught all three.
//
// It is therefore a PROXY, with the failure mode a proxy has
// (`.claude/rules/verify-the-deciding-side.md`): a fold a wrapper applies INLINE, without calling a
// shared function, is invisible here. Adding one is what would make this test certify a gap rather
// than miss it — so a fold belongs in `core/components`, called by name, on both paths.
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { adapterNames } from '../scripts/lib/adapter-names.mjs';

// Value imports only: a `type` import is erased and transforms nothing.
function sharedImports(source: string): Set<string> {
  const names = new Set<string>();
  const pattern = /import\s*\{([^}]*)\}\s*from\s*['"]([^'"]*)['"]/g;
  let match = pattern.exec(source);
  while (match !== null) {
    const specifier = match[2];
    if (
      /@symbiote-native\/components|\.\.\/state\/|\.\.\/view\/|\.\/render-/.test(
        specifier,
      )
    ) {
      for (const raw of match[1].split(',')) {
        const name = raw.trim();
        if (name !== '' && !name.startsWith('type ')) {
          names.add(name.split(' as ')[0].trim());
        }
      }
    }
    match = pattern.exec(source);
  }
  return names;
}

const kebab = (name: string): string =>
  name.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();

// Located by PATH, and it must resolve to exactly ONE file. A matcher that quietly finds nothing
// contributes an empty set, and ONE empty set zeroes an intersection across five adapters — which
// is how the first run of this comparison reported "no gaps" while three were live. The throw is
// the whole point: a silent miss here is indistinguishable from a clean tree.
function wrapperPathFor(adapter: string, primitive: string): string {
  const root = join('adapters', adapter, 'src', 'components');
  const want = kebab(primitive);
  const hits: string[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop();
    if (dir === undefined) break;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (!/\.(ts|tsx|svelte)$/.test(entry.name)) continue;
      if (/\.test\.|\.d\.ts$/.test(entry.name)) continue;
      const stem = entry.name.replace(/\.(ts|tsx|svelte)$/, '');
      if (stem === want || (stem === 'index' && basename(dir) === want)) {
        hits.push(full);
      }
    }
  }
  if (hits.length !== 1) {
    throw new Error(
      `${adapter}: expected exactly one ${primitive} wrapper, found ${hits.length}` +
        (hits.length > 0 ? ` (${hits.join(', ')})` : '') +
        ' — an unlocated wrapper makes this audit report a clean tree.',
    );
  }
  return hits[0];
}

interface ILoweredPrimitive {
  readonly behavior: string;
  // Names every wrapper imports that the behavior legitimately does not. Compared for EQUALITY, so
  // closing a gap without deleting its entry fails here too — the shape `KNOWN_GAPS` uses in
  // `tests/adapter-barrel-parity.test.ts`, and for the same reason: an allowlist nobody has to
  // prune becomes a place to hide.
  readonly wrapperOnly: Readonly<Record<string, string>>;
}

const LOWERED: Readonly<Record<string, ILoweredPrimitive>> = {
  Pressable: {
    behavior: 'core/components/src/behaviors/pressable.ts',
    // `android_ripple` was the one open FOLD gap and it is closed: the ripple background is an
    // ordinary prop of the responder itself in RN's own Pressable, so a single lowered node carries
    // it (see the behavior's foldPayload). Our wrapper's inner-View spelling mirrors
    // TouchableNativeFeedback and is what made this read as unfixable.
    wrapperOnly: {
      // The floor itself reaches both paths — the machine defaults to it when a config omits
      // `minPressDuration`. A wrapper names the constant only to seed `__minPressDuration`, the
      // input `Touchable*` overrides to 0. A lowered element has no such input to seed.
      DEFAULT_MIN_PRESS_DURATION_MS:
        'seeds the wrapper-only __minPressDuration override input',
    },
  },
  TextInput: {
    behavior: 'core/components/src/behaviors/text-input.ts',
    wrapperOnly: {
      // The render fn itself. Wrapper-only by construction — a lowered element has no render, which
      // is the entire point of lowering it.
      renderTextInput: 'the render half; a lowered element has no render',
      // The aria/role fold moved INTO the engine (`foldAriaProps`, run by `fabricProps`), so a
      // lowered element already gets it and a second application here would be the double-fold this
      // audit is meant to prevent. Verified on the committed payload: a lowered input carrying
      // `role="searchbox"` commits `accessibilityRole: 'search'`.
      resolveAccessibilityProps: 'applied by the engine in fabricProps',
    },
  },
};

describe('a lowered primitive applies every fold its wrapper applies', () => {
  for (const [primitive, spec] of Object.entries(LOWERED)) {
    it(`${primitive}`, () => {
      const behaviorNames = sharedImports(readFileSync(spec.behavior, 'utf8'));
      const perAdapter = adapterNames().map(adapter =>
        sharedImports(readFileSync(wrapperPathFor(adapter, primitive), 'utf8')),
      );

      // Intersection, not union: a name only ONE adapter imports is that adapter's own business,
      // and only a fold all five apply is a shared contract the lowered path owes.
      const union = new Set(perAdapter.flatMap(set => [...set]));
      const inEveryWrapper = [...union].filter(name =>
        perAdapter.every(set => set.has(name)),
      );

      const missing = inEveryWrapper
        .filter(name => !behaviorNames.has(name))
        .sort();
      expect(missing).toEqual(Object.keys(spec.wrapperOnly).sort());
    });
  }

  // The control. Every assertion above is "a set equals a set", and a `sharedImports` that returned
  // nothing would satisfy them all by making both sides empty — the false green this audit already
  // produced once. So pin that the parser reads a real, non-trivial set off a real wrapper.
  it('reads a non-empty import set, so an empty diff means agreement', () => {
    const names = sharedImports(
      readFileSync(wrapperPathFor('react', 'Pressable'), 'utf8'),
    );
    expect(names.has('createPressHandlers')).toBe(true);
    expect(names.size).toBeGreaterThan(3);
  });
});
