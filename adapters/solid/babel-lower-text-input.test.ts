// REFUSAL_CATEGORIES.dynamicIntrinsicChoice — a prop that picks between TWO intrinsics.
//
// `TextInput` commits `symbiote-text-input` or `symbiote-text-input-multiline`, which are different
// native views rather than one view with a flag (`core/components/src/view/render-text-input.ts`).
// A transform prints a static tag, so it can resolve that only from a compile-time literal.
//
// Stricter than the neighbouring refusals, and the difference is the point: an unreadable attribute
// VALUE means a prop arrives wrong and a later write can fix it; the wrong NATIVE VIEW cannot be
// repaired by any prop write, only by destroying and recreating the node.
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { transformAsync } from '@babel/core';

const require_ = createRequire(import.meta.url);

// The REAL entry. It was fed by a self-expiring injection while the switch was withheld; that
// module threw the moment this landed, which is what forced the cleanup rather than leaving a
// second copy to drift.
const {
  HOST_PRIMITIVES,
}: {
  HOST_PRIMITIVES: Record<
    string,
    { intrinsic: string; intrinsicWhen: { prop: string; intrinsic: string } }
  >;
} = require_('@symbiote-native/components/host-primitives');
const ENTRY = HOST_PRIMITIVES.TextInput;

// Read from the entry, not restated: a test that writes its own copy of the tag names passes while
// the entry says something else, which is exactly how the previous injection drifted.
const SINGLE = ENTRY.intrinsic;
const MULTI = ENTRY.intrinsicWhen.intrinsic;

const lowerHostPrimitives = require_('./babel-lower-host-primitives.cjs');
const presetSolid = require_('babel-preset-solid');
const IMPORT = "import { TextInput } from '@symbiote-native/solid';\n";

async function compile(source: string): Promise<string> {
  const result = await transformAsync(source, {
    filename: 'probe.jsx',
    babelrc: false,
    configFile: false,
    plugins: [lowerHostPrimitives],
    presets: [
      [presetSolid, { generate: 'universal', moduleName: '../renderer' }],
    ],
  });
  return result?.code ?? '';
}

describe('a primitive that selects its intrinsic from a prop', () => {
  it.each([
    ['a bare multiline attribute', '<TextInput multiline />', MULTI],
    ['an explicit true', '<TextInput multiline={true} />', MULTI],
    ['no multiline at all', '<TextInput />', SINGLE],
    ['an explicit false', '<TextInput multiline={false} />', SINGLE],
  ])('%s lowers to the right tag', async (_what, jsx, expected) => {
    const code = await compile(`${IMPORT}const a = ${jsx};`);
    expect(code).toContain(expected);
    if (expected === SINGLE) expect(code).not.toContain(MULTI);
    expect(code).not.toContain('_$createComponent(TextInput');
  });

  it('REFUSES a runtime value — the wrong native view cannot be repaired later', async () => {
    const code = await compile(
      `${IMPORT}const a = <TextInput multiline={isLong} />;`,
    );
    expect(code).toContain('_$createComponent(TextInput');
    expect(code).not.toContain(SINGLE);
    expect(code).not.toContain(MULTI);
  });

  // The case the IDENTITY rule exists for, and the one a truthiness-shaped rule would get wrong.
  // `1` is a compile-time literal and unambiguously truthy, so a check reasoning from the render
  // fn's `view.multiline ? … : …` would happily resolve it to the multiline tag. It must refuse:
  // the spec types the selector as a boolean, and a transform that starts guessing past the
  // declared type is how a silently wrong NATIVE VIEW ships. Pinned because a peer credited this
  // adapter with the behaviour before anything here measured it.
  //
  // Both rows are EXPRESSION CONTAINERS on purpose. `multiline="yes"` — a bare JSX string — refuses
  // one step earlier, on "not an expression container", so it passes under an identity rule and
  // under a truthiness rule alike and proves nothing about either. Verified by breaking the rule
  // toward truthiness: `{1}` went red and `"yes"` stayed green, which is what a row that cannot
  // distinguish the branches looks like.
  it.each([
    ['a truthy numeric literal', '<TextInput multiline={1} />'],
    ['a truthy string literal', "<TextInput multiline={'yes'} />"],
  ])('REFUSES %s', async (_what, jsx) => {
    const code = await compile(`${IMPORT}const a = ${jsx};`);
    expect(code).toContain('_$createComponent(TextInput');
    expect(code).not.toContain(SINGLE);
    expect(code).not.toContain(MULTI);
  });

  // The refusal is about the SELECTOR, not about dynamic props in general: a runtime value on any
  // other prop still lowers, because a prop write can carry it.
  it('lowers a runtime value on a NON-selector prop', async () => {
    const code = await compile(
      `${IMPORT}const a = <TextInput value={text} />;`,
    );
    expect(code).toContain(SINGLE);
    expect(code).not.toContain('_$createComponent(TextInput');
  });
});

// The imperative surface must not shrink when an element lowers — the same rule that keeps a
// lowered Pressable from GAINING one. The component's `ref` yields an `ITextInputHandle`
// (focus/blur/clear/isFocused/setSelection); a lowered element's ref yields the engine node, which
// carries focus/blur/measure/setNativeProps and none of the other three. So `<TextInput ref>` keeps
// the component. Measured before choosing: `examples/solid` has 5 `<TextInput>` sites and 0 with a
// ref, so this costs nothing there today — and the alternative (emitting a handle-wrapping helper
// from the transform) would owe the same emit in all four transforms under P0 parity, for a call
// shape the app does not write.
describe('a ref on TextInput', () => {
  it('REFUSES, because a lowered ref would yield a different handle', async () => {
    const code = await compile(`${IMPORT}const a = <TextInput ref={h} />;`);
    expect(code).toContain('_$createComponent(TextInput');
    expect(code).not.toContain(SINGLE);
  });

  // The refusal is about `ref`, not about TextInput: everything else still lowers.
  it('lowers the same element without a ref', async () => {
    const code = await compile(`${IMPORT}const a = <TextInput value={t} />;`);
    expect(code).toContain(SINGLE);
    expect(code).not.toContain('_$createComponent(TextInput');
  });
});
