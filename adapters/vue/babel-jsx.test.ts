// The TSX lowering, compiled through the real @vue/babel-plugin-jsx. What matters is the emitted
// vnode shape, and the two halves fail in DIFFERENT ways, so both are pinned separately:
//
//   element   createVNode("symbiote-view", props, [children])          ← array children
//   component createVNode(View, props, {default: () => [children]})    ← slot children
//
// A half-done lowering emits `resolveComponent("symbiote-view")` WITH slot children: a component
// that resolves to nothing, mounted through a path that never reads those children. Blank subtree,
// no error, nothing red — which is why the "without isCustomElement" case has its own test rather
// than being left to documentation.

import { describe, expect, it } from 'vitest';
import { transformAsync } from '@babel/core';
import vueJsx from '@vue/babel-plugin-jsx';

import symbioteVueJsx from './babel-jsx.cjs';
import lowerHostPrimitives from './babel-lower-host-primitives.cjs';

async function compile(
  source: string,
  plugins: unknown[] = symbioteVueJsx(),
): Promise<string> {
  const result = await transformAsync(source, {
    filename: 'probe.jsx',
    babelrc: false,
    configFile: false,
    plugins,
  });
  return result?.code ?? '';
}

const IMPORT = "import { View, Text } from '@symbiote-native/vue';\n";

describe('vue TSX host-primitive lowering', () => {
  it('lowers an imported View to an element vnode with ARRAY children', async () => {
    const code = await compile(
      `${IMPORT}const a = <View style={s}>{kids}</View>;`,
    );
    expect(code).toContain('_createVNode("symbiote-view"');
    expect(code).toContain('[kids]');
    expect(code).not.toContain('default: () =>');
  });

  it('lowers an imported Text', async () => {
    const code = await compile(`${IMPORT}const a = <Text>{label}</Text>;`);
    expect(code).toContain('_createVNode("symbiote-text"');
  });

  it('follows an import alias', async () => {
    const code = await compile(
      "import { View as Box } from '@symbiote-native/vue';\nconst a = <Box>{kids}</Box>;",
    );
    expect(code).toContain('_createVNode("symbiote-view"');
  });

  it('treats a hand-written symbiote-* tag as an element too', async () => {
    const code = await compile('const a = <symbiote-image src={u} />;');
    expect(code).toContain('_createVNode("symbiote-image"');
    expect(code).not.toContain('_resolveComponent');
  });

  it('keeps a spread on the element path', async () => {
    const code = await compile(
      `${IMPORT}const a = <View {...rest}>{kids}</View>;`,
    );
    expect(code).toContain('_createVNode("symbiote-view", rest, [kids])');
  });

  // ── the half-done shapes, each failing differently ──

  // why: THE footgun this module's single require() exists to prevent. Without isCustomElement the
  // rewritten tag is a component nobody registered, and its children arrive as a slot the element
  // path never reads — a blank subtree with no error.
  it('without isCustomElement, a lowered tag degrades to an unresolvable component', async () => {
    const code = await compile(`${IMPORT}const a = <View>{kids}</View>;`, [
      lowerHostPrimitives,
      vueJsx,
    ]);
    expect(code).toContain('_resolveComponent("symbiote-view")');
    expect(code).toContain('default: () =>');
  });

  it('without the lowering, View stays a component instance', async () => {
    const code = await compile(`${IMPORT}const a = <View>{kids}</View>;`, [
      vueJsx,
    ]);
    expect(code).toContain('_createVNode(View');
    expect(code).toContain('default: () =>');
  });

  // ── refusals ──

  it('does NOT lower a View that is not imported from us', async () => {
    const code = await compile(
      "import { View } from 'some-other-ui';\nconst a = <View>{kids}</View>;",
    );
    expect(code).toContain('_createVNode(View');
  });

  it('does NOT lower a locally shadowed name', async () => {
    const code = await compile(
      `${IMPORT}function f(View) { return <View>{kids}</View>; }`,
    );
    expect(code).toContain('_createVNode(View');
  });
});

// Pressable OWNS state, so it lowers only when the template does not read it — see the twin suite
// in metro-vue-transformer.test.ts for the SFC half. Every refusal is paired with the nearest
// LOWERING case: a detector that refuses everything passes half a suite and fails the pair.
describe('vue TSX Pressable lowering refusals', () => {
  const P = "import { Pressable, Text } from '@symbiote-native/vue';\n";
  const LOWERED = 'symbiote-pressable';

  it('lowers a Pressable whose template reads no press state', async () => {
    const code = await compile(
      `${P}const a = <Pressable class="x">{kids}</Pressable>;`,
    );
    expect(code).toContain(LOWERED);
  });

  // `style={styleFn}` is an Identifier at compile time and no transform can tell an object from a
  // function. It USED to refuse for that reason; it now lowers behind a runtime typeof guard, which
  // needs no such proof. The pair is built by reading the expression twice, so what still refuses is
  // an expression that cannot be read twice — pinned in its own test below.
  it('lowers a hoisted style behind a runtime typeof guard', async () => {
    const hoisted = await compile(
      `${P}const a = <Pressable style={styleFn}>{kids}</Pressable>;`,
    );
    expect(hoisted).toContain(LOWERED);
    expect(hoisted).toContain('typeof styleFn === "function"');
    expect(hoisted, 'a non-function keeps no active variant').toContain(
      'undefined',
    );
  });

  it('lowers an object literal or an array with no pair at all', async () => {
    const object = await compile(
      `${P}const a = <Pressable style={{ borderColor: c }}>{kids}</Pressable>;`,
    );
    expect(object).toContain(LOWERED);
    expect(object).not.toContain('activeStyle');

    const array = await compile(
      `${P}const a = <Pressable style={[base, extra]}>{kids}</Pressable>;`,
    );
    expect(array, 'an array literal cannot be the state fn itself').toContain(
      LOWERED,
    );
  });

  // Where the AST is in hand the pair is SUBSTITUTED rather than called, so a provable body costs
  // no closure and no invocation. This is an optimisation only: it must never change the verdict,
  // which is why the unprovable body beside it still lowers.
  it('substitutes a provable body and calls an unprovable one', async () => {
    const provable = await compile(
      `${P}const a = <Pressable style={({ pressed }) => ({ o: pressed ? 1 : 2 })}>{kids}</Pressable>;`,
    );
    expect(provable).toContain(LOWERED);
    expect(provable, 'folded to two literals, no call emitted').not.toContain(
      'pressed: false',
    );

    const unprovable = await compile(
      `${P}const a = <Pressable style={({ pressed }) => ({ f: () => pressed })}>{kids}</Pressable>;`,
    );
    expect(unprovable, 'the call covers what substitution cannot').toContain(
      LOWERED,
    );
    expect(unprovable).toContain('pressed: false');
  });

  // An expression that can DO WORK when read lowers too, but through the runtime helper rather than
  // the inline guard — the guard prints the expression on both props, which would run `getStyle()`
  // four times per bag build. This was briefly written as a REFUSAL, which was wrong: the hazard
  // belongs to the emit shape, not to the expression, so refusing would have cost coverage to dodge
  // a defect the helper does not have. The count is what pins it; the verdict alone would not.
  it('routes a style that cannot be read twice through the helper', async () => {
    const called = await compile(
      `${P}const a = <Pressable style={getStyle()}>{kids}</Pressable>;`,
    );
    expect(called).toContain(LOWERED);
    expect(called.split('getStyle').length - 1, 'read exactly once').toBe(1);
    expect(called).toContain('resolveStateStyle');

    const computed = await compile(
      `${P}const a = <Pressable style={bag[i]}>{kids}</Pressable>;`,
    );
    expect(computed).toContain(LOWERED);
    expect(computed.split('bag[i]').length - 1, 'read exactly once').toBe(1);
  });

  it('keeps the cheap emission for a name, which needs no helper', async () => {
    const code = await compile(
      `${P}const a = <Pressable style={styleFn}>{kids}</Pressable>;`,
    );
    expect(code).toContain(LOWERED);
    expect(
      code,
      'a read cannot change meaning, so it keeps its patch flag',
    ).not.toContain('resolveStateStyle');
  });

  // `ref` on a COMPONENT yields the instance and on an element the host node, so lowering would
  // silently hand the app a different object. Found by the shared verdict table.
  it('refuses an element whose ref binds the instance', async () => {
    const code = await compile(
      `${P}const a = <Pressable ref={handle}>{kids}</Pressable>;`,
    );
    expect(code).not.toContain(LOWERED);
  });

  // Arity is the whole distinction, and it is the one place JSX differs from the SFC half: a
  // zero-arity function child is an ordinary lazy child and lowers, while an SFC `<template>` child
  // refuses either way because lowering it makes codegen throw.
  it('refuses a render-prop child but lowers a zero-arity one', async () => {
    const renderProp = await compile(
      `${P}const a = <Pressable>{({ pressed }) => <Text>{pressed}</Text>}</Pressable>;`,
    );
    expect(renderProp).not.toContain(LOWERED);

    const lazy = await compile(
      `${P}const a = <Pressable>{() => <Text>y</Text>}</Pressable>;`,
    );
    expect(lazy).toContain(LOWERED);
  });

  it('refuses a spread, which could hide a style fn', async () => {
    const code = await compile(
      `${P}const a = <Pressable {...rest}>{kids}</Pressable>;`,
    );
    expect(code).not.toContain(LOWERED);
  });

  it('still lowers View and Text beside a refused Pressable', async () => {
    const code = await compile(
      "import { Pressable, View } from '@symbiote-native/vue';\n" +
        'const a = <View><Pressable {...rest}>{kids}</Pressable></View>;',
    );
    expect(code).toContain('symbiote-view');
    expect(code).not.toContain(LOWERED);
  });
});
