// The specialiser DRIVEN THROUGH THE REAL PLUGIN, not called directly. The unit tests beside this
// prove the substitution; this proves the wiring, and the two are not the same claim — a specialiser
// that works in isolation while `canLower` still refuses, or while the attribute is never rewritten,
// passes every unit test and changes nothing that ships
// (`.claude/rules/test-harness-false-greens.md` §11).
//
// Spec entry injected the same way `babel-lower-pressable.test.ts` does, and for the same reason
// recorded there.
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

describe('a specialisable functional style lowers instead of refusing', () => {
  it('lowers the destructured ternary shape and emits both style slots', async () => {
    const code = await compile(
      `${IMPORT}const a = <Pressable style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}><Text>x</Text></Pressable>;`,
    );

    expect(code).toContain('symbiote-pressable');
    expect(code).not.toContain('createComponent(Pressable');
    // Both halves reach the output. Asserting only the tag would pass while the variant is dropped,
    // which is a button that lowers and never changes appearance.
    expect(code).toContain('activeStyle');
    expect(code).toContain('0.6');
    expect(code).toContain('opacity: 1');
    // The arrow itself must be GONE — if it survives, the template still reads the press state and
    // the whole point is lost even though the tag looks lowered.
    expect(code).not.toContain('pressed');
  });

  it('carries a runtime free name into both slots', async () => {
    const code = await compile(
      `${IMPORT}const a = <Pressable style={({ pressed }) => ({ borderColor: c, opacity: pressed ? 0.6 : 1 })}><Text>x</Text></Pressable>;`,
    );
    expect(code).toContain('symbiote-pressable');
    // Two occurrences: once in the base slot, once in the active one.
    expect(code.match(/borderColor:\s*c/g)?.length).toBe(2);
  });

  // The refusal surface must SHRINK, not disappear: a body the substitution cannot prove still
  // keeps the component, exactly as before.
  it('still refuses a shape it cannot specialise', async () => {
    const code = await compile(
      `${IMPORT}const a = <Pressable style={({ pressed }) => ({ f: () => pressed })}><Text>x</Text></Pressable>;`,
    );
    expect(code).toContain('createComponent(Pressable');
  });
});
