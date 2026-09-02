// The two refusals a STATE-OBSERVING primitive adds, exercised against the REAL spec entry.
//
// This file used to inject its own `Pressable` entry, because the spec entry is a switch for all
// five transforms at once and landed last — until every transform could refuse, a render-prop
// Pressable would have lowered into a tag with no machine, a button that does not press with
// nothing red anywhere. The entry landed 2026-08-30 (`host-primitives.cjs`), and the injection
// outlived it: it kept OVERWRITING the real entry with a poorer one (`aliases: {}` against the
// real `ID_ALIAS`), so seven green tests were measuring a configuration that does not ship and the
// `id` -> `nativeID` rename was covered by nothing at all.
//
// So: no injection. A test that builds its own version of the thing under test stops being a test
// of it the moment the real one moves, and nothing announces the divergence.
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { transformAsync } from '@babel/core';

const require_ = createRequire(import.meta.url);
const lowerHostPrimitives = require_('./babel-lower-host-primitives.cjs');
const presetSolid = require_('babel-preset-solid');

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

const IMPORT = "import { Pressable, Text } from '@symbiote-native/solid';\n";

describe('lowering a state-observing primitive', () => {
  it('lowers a Pressable that observes nothing', async () => {
    const code = await compile(
      `${IMPORT}const a = <Pressable class="btn" onPress={go}><Text>x</Text></Pressable>;`,
    );
    expect(code).toContain('symbiote-pressable');
    expect(code).not.toContain('createComponent(Pressable');
  });

  // why: the case that dominates the tree — ActionButton's child is `{() => <Text/>}`. A rule that
  // refused on `typeof child === 'function'` would throw away ten of the twelve function children
  // in examples/solid, including the one definition instantiated 146 times.
  it('lowers a ZERO-arity function child — an ordinary Solid child, not a render prop', async () => {
    const code = await compile(
      `${IMPORT}const a = <Pressable class="btn">{() => <Text>x</Text>}</Pressable>;`,
    );
    expect(code).toContain('symbiote-pressable');
  });

  it('REFUSES a render-prop child, which takes the press state', async () => {
    const code = await compile(
      `${IMPORT}const a = <Pressable class="btn">{state => <Text>{state().pressed}</Text>}</Pressable>;`,
    );
    expect(code).toContain('createComponent(Pressable');
    expect(code).not.toContain('symbiote-pressable');
  });

  // THREE tests used to stand here, all about the build-time split — one for a body the
  // specialiser could prove, one for the invocation fallback, one for a non-destructured
  // parameter. The split was removed 2026-09-01 after it was measured
  // (`src/state-style-cost.bench.test.ts`): it emitted TWO writes per node where the engine's
  // `routeProp` callback path emits one, so it cost run time rather than saving it.
  //
  // What replaces them is the contract that now holds, and it is narrower on purpose: the
  // expression must reach the output UNCHANGED. That is what makes
  // `REFUSAL_CATEGORIES.emitStyleExpressionOnce` trivially satisfied here — the expression is
  // emitted once because it is emitted verbatim — and it is the property a future "optimisation"
  // would have to break to reintroduce the hazard.
  it('lowers a functional style and passes the expression through UNTOUCHED', async () => {
    const code = await compile(
      `${IMPORT}const a = <Pressable style={({ pressed }) => ({opacity: pressed ? 0.6 : 1})}><Text>x</Text></Pressable>;`,
    );
    expect(code).toContain('symbiote-pressable');
    // No pair, no invocation, no helper: the three shapes the removed pass could emit.
    expect(code).not.toContain('activeStyle');
    expect(code).not.toContain('pressed: false');
    expect(code).not.toContain('resolveStateStyle');
    // And the author's own expression, once.
    expect(code.split('pressed ? 0.6 : 1')).toHaveLength(2);
  });

  // The non-destructured idiom took a DIFFERENT path under the split (invocation rather than
  // substitution), so the two looked interchangeable in an app while only one was free. With the
  // split gone there is one path, and this pins that they are now genuinely the same.
  it('treats a non-destructured parameter identically', async () => {
    const code = await compile(
      `${IMPORT}const a = <Pressable style={s => ({opacity: s.pressed ? 0.6 : 1})}><Text>x</Text></Pressable>;`,
    );
    expect(code).toContain('symbiote-pressable');
    expect(code).not.toContain('activeStyle');
    expect(code.split('s.pressed ? 0.6 : 1')).toHaveLength(2);
  });

  it('lowers an OBJECT style — the migrated shape', async () => {
    const code = await compile(
      `${IMPORT}const a = <Pressable class="btn" style={{borderColor: c}}><Text>x</Text></Pressable>;`,
    );
    expect(code).toContain('symbiote-pressable');
  });

  // why: the extra refusals must not weaken the one every primitive still has. The `aria-*` half
  // of this used to be a refusal too and is now the opposite assertion — the fold moved into the
  // engine, so a lowered Pressable gets it (see `babel-lower-host-primitives.test.ts`). Keeping
  // both in one test is deliberate: it is the pair that shows the spread refusal survived a change
  // that removed its neighbour.
  it('still refuses a spread, and now lowers an aria-* on a state-observing tag', async () => {
    const spread = await compile(`${IMPORT}const a = <Pressable {...rest} />;`);
    expect(spread).toContain('createComponent(Pressable');
    const aria = await compile(
      `${IMPORT}const a = <Pressable aria-label="go"><Text>x</Text></Pressable>;`,
    );
    expect(aria).toContain('symbiote-pressable');
    expect(aria).not.toContain('createComponent(Pressable');
  });

  // why: View has no `observesState`, so the two new refusals must not reach it — a functional
  // style on a View is just a value the adapter forwards.
  it('does NOT apply the state refusals to View', async () => {
    const code = await compile(
      "import { View } from '@symbiote-native/solid';\nconst a = <View style={f}>{x => x}</View>;",
    );
    expect(code).toContain('symbiote-view');
  });

  // The coverage the injection destroyed. `aliases: {}` made this unobservable for as long as the
  // real entry carried `ID_ALIAS` — a rename that ships and was tested by nothing.
  it('renames id to nativeID on a lowered Pressable', async () => {
    const code = await compile(
      `${IMPORT}const el = <Pressable id="save"><Text>y</Text></Pressable>;`,
    );
    expect(code).toContain('symbiote-pressable');
    expect(code).toContain('nativeID');
    expect(code).not.toMatch(/\bid\b\s*[:=]\s*["']save["']/);
  });

  // Break-test for the assertion above: the same regex MUST match when no rename happens, or the
  // negative arm would pass for a transform that lowers nothing. A refused Pressable is the arm —
  // it stays a component, so `id` reaches the output untouched.
  //
  // The refusal used here is the SPREAD, deliberately: it is a permanent one (an unenumerable
  // attribute set cannot be lowered by any transform). The obvious alternative — a nested-function
  // style — is a refusal the shared table calls a defect, so closing that gap would turn this arm
  // red for a reason that has nothing to do with what it tests.
  it('leaves id alone on a Pressable the transform refuses', async () => {
    const code = await compile(
      `${IMPORT}const el = <Pressable id="save" {...rest}>` +
        `<Text>y</Text></Pressable>;`,
    );
    expect(code).not.toContain('symbiote-pressable');
    expect(code).toMatch(/\bid\b\s*[:=]\s*["']save["']/);
  });
});
