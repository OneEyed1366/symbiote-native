// The lowering is a silent transform: when it fires wrongly nothing is red, the app just loses a
// prop or rewrites a symbol that was never ours. So half of these assert it REFUSES.
//
// Compiled through the real babel-preset-solid, not just the plugin, because what matters is the
// emitted call shape — `createElement("symbiote-view") + setProp` (element) vs
// `createComponent(View, …)` (component, and therefore a props Proxy).

import { describe, expect, it } from 'vitest';
import { transformAsync } from '@babel/core';
import solidPreset from 'babel-preset-solid';

import lowerHostPrimitives from './babel-lower-host-primitives.cjs';
import { HOST_PRIMITIVES } from '@symbiote-native/components/host-primitives';

async function compile(source: string): Promise<string> {
  const result = await transformAsync(source, {
    filename: 'probe.jsx',
    babelrc: false,
    configFile: false,
    plugins: [lowerHostPrimitives],
    presets: [
      [
        solidPreset,
        {
          generate: 'universal',
          moduleName: '@symbiote-native/solid/renderer',
        },
      ],
    ],
  });
  return result?.code ?? '';
}

const IMPORT = "import { View, Text } from '@symbiote-native/solid';\n";

describe('solid host-primitive lowering', () => {
  it('lowers an imported View to its intrinsic tag', async () => {
    const code = await compile(
      `${IMPORT}const a = <View style={s}>{kids}</View>;`,
    );
    expect(code).toContain('_$createElement("symbiote-view")');
    expect(code).not.toContain('_$createComponent(View');
  });

  it('lowers an imported Text to its intrinsic tag', async () => {
    const code = await compile(`${IMPORT}const a = <Text>{label}</Text>;`);
    expect(code).toContain('_$createElement("symbiote-text")');
  });

  it('follows an import alias', async () => {
    const code = await compile(
      "import { View as Box } from '@symbiote-native/solid';\nconst a = <Box>{kids}</Box>;",
    );
    expect(code).toContain('_$createElement("symbiote-view")');
  });

  it('renames RN’s id alias to nativeID', async () => {
    const code = await compile(`${IMPORT}const a = <View id={x} />;`);
    expect(code).toContain('"nativeID"');
    expect(code).not.toContain('"id"');
  });

  // why: the wrapper's own <symbiote-view ref={…}> compiles to a direct one-shot ref, so lowering
  // must not silently move a caller's ref onto spread's re-running effect. Verified against the
  // emitted shape rather than assumed.
  it('keeps ref on the direct one-shot path, outside spread', async () => {
    const code = await compile(
      `${IMPORT}const a = <View ref={r} style={s} />;`,
    );
    expect(code).toContain('_$use(');
    expect(code).not.toContain('_$spread(');
  });

  // ── refusals ──

  it('does NOT lower a View that is not imported from us', async () => {
    const code = await compile(
      "import { View } from 'some-other-ui';\nconst a = <View>{kids}</View>;",
    );
    expect(code).toContain('_$createComponent(View');
  });

  it('does NOT lower a locally shadowed name', async () => {
    const code = await compile(
      `${IMPORT}function f(View) { return <View>{kids}</View>; }`,
    );
    expect(code).toContain('_$createComponent(View');
  });

  // These two asserted a REFUSAL until 2026-08-31. `aria-*` and `role` fold into the composite
  // accessibilityState/accessibilityValue, which needs the whole bag, and an element path has no
  // bag — so the transform kept the wrapper. The fold then moved into the engine
  // (`core/engine/src/accessibility-props.ts`, called from `fabricProps`, the one place the whole
  // bag is visible on both commit paths), which made the refusal protect nothing while still
  // costing coverage on props real apps write constantly. That the FOLD still lands on a lowered
  // element is proven on the committed payload in `src/aria-fold-parity.test.tsx`; this only pins
  // the verdict.
  it('lowers an element carrying aria-*', async () => {
    const code = await compile(`${IMPORT}const a = <View aria-checked={x} />;`);
    expect(code).toContain('symbiote-view');
    expect(code).not.toContain('_$createComponent(View');
  });

  it('lowers an element carrying role', async () => {
    const code = await compile(`${IMPORT}const a = <View role="button" />;`);
    expect(code).toContain('symbiote-view');
    expect(code).not.toContain('_$createComponent(View');
  });

  // why: a spread's keys are unknown at compile time, so it may carry aria-* — the one case the
  // refusal above cannot see.
  it('does NOT lower an element carrying a spread', async () => {
    const code = await compile(`${IMPORT}const a = <View {...rest} />;`);
    expect(code).toContain('_$createComponent(View');
  });

  // Was `Pressable` until the spec gained it on 2026-08-23, then `Switch` until it gained that one
  // too on 2026-09-01 — naming the subject rots every time the spec grows, and each time the
  // failure reads as a lowering regression rather than as a stale fixture
  // (`.claude/rules/fold-only-primitive-recipe.md`, "Landing a key EXPIRES every test..."). The
  // subject is DERIVED instead, so the day a candidate lands it simply stops being chosen, and if
  // every candidate is lowered the test says so rather than quietly asserting nothing. Pressable's
  // own lowering, and the two extra refusals its `observesState` flag turns on, live in
  // babel-lower-pressable.test.ts.
  it('leaves a component the spec does not list alone', async () => {
    const candidates = [
      'Switch',
      'ScrollView',
      'Modal',
      'RefreshControl',
      'SafeAreaView',
    ];
    const absent = candidates.filter(
      name => HOST_PRIMITIVES[name] === undefined,
    );
    expect(
      absent.length,
      `every candidate is now lowerable (${candidates.join(', ')}) — pick a primitive that is still absent, or retire this case`,
    ).toBeGreaterThan(0);
    const subject = absent[0];

    const code = await compile(
      `import { ${subject} } from '@symbiote-native/solid';\nconst a = <${subject} value={on} />;`,
    );
    expect(code).toContain(`_$createComponent(${subject}`);
  });
});
