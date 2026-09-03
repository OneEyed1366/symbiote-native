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
  // Every style shape lowers and the author's expression reaches the output EXACTLY ONCE,
  // untouched. That is the structural form of `REFUSAL_CATEGORIES.emitStyleExpressionOnce`: with
  // the state-style split gone there is no emission left that could print an expression twice, so
  // the property that used to need a runtime helper now holds by construction. `routeProp` resolves
  // the callback at both values of `pressed` (`isStyleCallback`).
  it.each([
    ['a hoisted name', 'styleFn', 'styleFn'],
    ['a call that can do work when read', 'getStyle()', 'getStyle'],
    ['a computed member', 'bag[i]', 'bag[i]'],
  ])('lowers %s, printing it once', async (_what, expression, needle) => {
    const code = await compile(
      `${P}const a = <Pressable style={${expression}}>{kids}</Pressable>;`,
    );

    expect(code).toContain(LOWERED);
    expect(code.split(needle).length - 1, 'printed exactly once').toBe(1);
    expect(code, 'no pair is emitted any more').not.toContain('activeStyle');
    expect(code, 'and no runtime helper is needed').not.toContain(
      'resolveStateStyle',
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

  // A provable body and an unprovable one are now the SAME case, and that is the point of removing
  // the split: substitution used to fold the first into two literals and call the second, so the
  // two shapes had different output. Neither is inspected now.
  it.each([
    ['provable', '({ pressed }) => ({ o: pressed ? 1 : 2 })'],
    ['unprovable', '({ pressed }) => ({ f: () => pressed })'],
  ])('lowers a %s inline callback without invoking it', async (_what, body) => {
    const code = await compile(
      `${P}const a = <Pressable style={${body}}>{kids}</Pressable>;`,
    );

    expect(code).toContain(LOWERED);
    expect(code, 'the transform no longer applies it to a state').not.toContain(
      'pressed: false',
    );
    expect(code).not.toContain('activeStyle');
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
