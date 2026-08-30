// The two refusals a STATE-OBSERVING primitive adds, exercised against a Pressable entry this file
// injects itself.
//
// The real entry is deliberately NOT in `HOST_PRIMITIVES` yet: that entry is a switch for all five
// transforms at once, and one that has not implemented these refusals would silently lower a
// render-prop Pressable into a tag with no machine — a button that does not press, with nothing
// red anywhere. So the spec entry lands LAST, once every transform can refuse, and until then this
// is how the detections are proven.
//
// Injecting into the required spec object works because both modules are CJS singletons in one
// process and the plugin snapshots `HOST_PRIMITIVES` at load: mutate first, require the plugin
// second. vitest isolates per file, so nothing here leaks into the View/Text suite.
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { transformAsync } from '@babel/core';

const require_ = createRequire(import.meta.url);
const spec = require_('@symbiote-native/components/host-primitives');
spec.HOST_PRIMITIVES.Pressable = {
  intrinsic: 'symbiote-pressable',
  aliases: {},
  defaults: {},
  observesState: true,
};
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

  it('REFUSES a functional style — the template reads the press state', async () => {
    const code = await compile(
      `${IMPORT}const a = <Pressable style={s => ({opacity: s.pressed ? 0.6 : 1})}><Text>x</Text></Pressable>;`,
    );
    expect(code).toContain('createComponent(Pressable');
  });

  it('lowers an OBJECT style — the migrated shape', async () => {
    const code = await compile(
      `${IMPORT}const a = <Pressable class="btn" style={{borderColor: c}}><Text>x</Text></Pressable>;`,
    );
    expect(code).toContain('symbiote-pressable');
  });

  // why: the extra refusals must not weaken the ones every primitive already has.
  it('still refuses a spread and an aria-* on a state-observing tag', async () => {
    const spread = await compile(`${IMPORT}const a = <Pressable {...rest} />;`);
    expect(spread).toContain('createComponent(Pressable');
    const aria = await compile(
      `${IMPORT}const a = <Pressable aria-label="go"><Text>x</Text></Pressable>;`,
    );
    expect(aria).toContain('createComponent(Pressable');
  });

  // why: View has no `observesState`, so the two new refusals must not reach it — a functional
  // style on a View is just a value the adapter forwards.
  it('does NOT apply the state refusals to View', async () => {
    const code = await compile(
      "import { View } from '@symbiote-native/solid';\nconst a = <View style={f}>{x => x}</View>;",
    );
    expect(code).toContain('symbiote-view');
  });
});
