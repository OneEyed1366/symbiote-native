// RN's `role` / `aria-*` fold must reach the committed payload identically down all three paths
// that produce a host node here — the lowered tag, the component wrapper, and a hand-authored tag.
//
// The fold itself lives in the ENGINE (`core/engine/src/accessibility-props.ts`, called from
// `fabricProps`), i.e. BELOW this adapter. That placement is what this file is checking from above:
// a transform that renamed or reshaped one of those keys on the way down would leave the fold
// looking at a bag it does not recognise, and the failure is silent — accessibility simply stops,
// on device, with every suite green.
//
// Worth stating because it surprised the session that asked for this: Svelte's preprocessor never
// implemented the `bagFold` refusal (only Solid's did), so `<View role="button">` has been LOWERING
// here all along rather than falling back to the wrapper. Correctness on that path has therefore
// always rested on the engine seeing the raw keys — which is exactly what the lowered arm below
// pins.
import { afterAll, describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
import { installFabric } from '@symbiote-native/test-utils';
import { lowerHostPrimitives } from './preprocessor/lower-host-primitives';
import './register';
import { mount, unmount } from './render';

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined)
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });

const fabric = installFabric();

const SRC_DIR = __dirname;
const COMPONENTS_DIR = join(SRC_DIR, 'components');
const VIEW_OUT = join(COMPONENTS_DIR, '.smoke-compiled-view-for-aria.mjs');
const PROBE_OUT = join(SRC_DIR, '.smoke-compiled-aria-probe.mjs');

const COMPILE_OPTIONS = {
  generate: 'client',
  fragments: 'tree',
  css: 'external',
} as const;

const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));
const settle = async (): Promise<void> => {
  await tick();
  await tick();
  await tick();
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

function committedProps(testID: string): Record<string, unknown> {
  const walk = (
    nodes: readonly unknown[],
  ): Record<string, unknown> | undefined => {
    for (const node of nodes) {
      if (!isRecord(node)) continue;
      const props = node.props;
      if (isRecord(props) && props.testID === testID) return props;
      const children = node.children;
      if (Array.isArray(children)) {
        const hit = walk(children);
        if (hit !== undefined) return hit;
      }
    }
    return undefined;
  };
  const found = walk(fabric.appRoot().children);
  if (found === undefined)
    throw new Error(`no committed node carries testID ${testID}`);
  return found;
}

const PACKAGE_IMPORT_LINE = /^.*from '@symbiote-native\/svelte';$/m;

function lower(source: string): string {
  const result = lowerHostPrimitives().markup({
    content: source,
    filename: 'AriaProbe.svelte',
  });
  const lowered = result === undefined ? source : result.code;
  if (lowered === source) throw new Error('the transform refused the probe');
  return lowered.replace(PACKAGE_IMPORT_LINE, '');
}

// Mount AND read in one call. `fabric.appRoot()` is the CURRENT root, so mounting three arms and
// then reading all three finds only the last — the first version of this file did exactly that and
// threw `no committed node carries testID aria-lowered`, which is the harness failing loudly rather
// than an arm disagreeing. Each arm is now read while it is the live tree.
async function mountAndRead(
  source: string,
  rootTag: number,
  testID: string,
): Promise<Record<string, unknown>> {
  await mountSource(source, rootTag);
  const props = committedProps(testID);
  unmount(rootTag);
  return props;
}

async function mountSource(source: string, rootTag: number): Promise<void> {
  writeFileSync(
    PROBE_OUT,
    compile(source, { ...COMPILE_OPTIONS, filename: 'AriaProbe.svelte' }).js
      .code,
  );
  const { default: Probe } = (await import(
    `file://${PROBE_OUT}?arm=${rootTag}`
  )) as { default: Component };
  mount(rootTag, Probe, {});
  await settle();
}

afterAll(() => {
  for (const path of [VIEW_OUT, PROBE_OUT]) rmSync(path, { force: true });
});

// One authored markup per case, rendered three ways. `attributes` is spliced into the tag for the
// first two arms and into the bag literal for the third, so all three carry the same authored
// intent and differ only in which path builds the node.
const componentArm = (testID: string, attributes: string): string =>
  [
    `<script>`,
    `  import View from '${VIEW_OUT}';`,
    `</script>`,
    `<View testID="${testID}" ${attributes}></View>`,
  ].join('\n');

const loweredArm = (testID: string, attributes: string): string =>
  lower(
    [
      `<script>`,
      `  import { View } from '@symbiote-native/svelte';`,
      `</script>`,
      `<View testID="${testID}" ${attributes}></View>`,
    ].join('\n'),
  );

const handwrittenArm = (testID: string, bagEntries: string): string =>
  `<symbiote-view p={{ testID: "${testID}", ${bagEntries} }}></symbiote-view>`;

describe('the aria/role fold reaches Fabric on every path', () => {
  it('folds role and aria-label, and leaves neither raw key behind', async () => {
    writeFileSync(
      VIEW_OUT,
      compile(readFileSync(join(COMPONENTS_DIR, 'View.svelte'), 'utf8'), {
        ...COMPILE_OPTIONS,
        filename: 'View.svelte',
      }).js.code,
    );

    const attributes = `role="button" aria-label="close"`;
    const arms = {
      lowered: await mountAndRead(
        loweredArm('aria-lowered', attributes),
        9_101,
        'aria-lowered',
      ),
      component: await mountAndRead(
        componentArm('aria-component', attributes),
        9_102,
        'aria-component',
      ),
      handwritten: await mountAndRead(
        handwrittenArm(
          'aria-handwritten',
          `role: "button", "aria-label": "close"`,
        ),
        9_103,
        'aria-handwritten',
      ),
    };

    for (const [arm, props] of Object.entries(arms)) {
      // BOTH SIDES, and neither half is sufficient alone: the value must have arrived THROUGH the
      // fold, and the raw key must be gone because the fold consumed it rather than because
      // something camelised it on the way down. A missing `aria-label` reads the same under both.
      expect(props.accessibilityRole, `${arm} role`).toBe('button');
      expect(props.accessibilityLabel, `${arm} label`).toBe('close');
      expect(props, `${arm} drops role`).not.toHaveProperty('role');
      expect(props, `${arm} drops aria-label`).not.toHaveProperty('aria-label');
      // The camelised spellings are what a transform would produce if it normalised the key: the
      // engine reads the HYPHENATED form literally (`bag['aria-label']`), so a camelised key is
      // invisible to the fold and would be committed raw.
      expect(props, `${arm} never camelises`).not.toHaveProperty('ariaLabel');
      expect(props, `${arm} never camelises`).not.toHaveProperty('ariaChecked');
    }
  });

  it('lets the alias win FIELD-BY-FIELD inside accessibilityState', async () => {
    // The opposite precedence from a scalar, and the case worth pinning because the two rules read
    // as contradictory: an explicit scalar prop beats its alias, but inside the composite the alias
    // beats the field it names while every other field of the explicit object survives.
    const attributes = `accessibilityState={{ checked: false, busy: true }} aria-checked={true}`;
    const arms = {
      lowered: await mountAndRead(
        loweredArm('state-lowered', attributes),
        9_104,
        'state-lowered',
      ),
      component: await mountAndRead(
        componentArm('state-component', attributes),
        9_105,
        'state-component',
      ),
      handwritten: await mountAndRead(
        handwrittenArm(
          'state-handwritten',
          `accessibilityState: { checked: false, busy: true }, "aria-checked": true`,
        ),
        9_106,
        'state-handwritten',
      ),
    };

    for (const [arm, props] of Object.entries(arms)) {
      expect(props.accessibilityState, `${arm} state`).toMatchObject({
        checked: true,
        busy: true,
      });
    }
  });

  // A QUOTED aria attribute is a STRING in every one of these templates — `aria-checked="true"`
  // yields `'true'`, not `true` — and the engine's fold does no coercion (`ariaChecked ?? …`). So
  // the committed `accessibilityState.checked` is the string, which is not what RN's native side
  // expects (boolean | 'mixed'). Recorded as an assertion rather than a comment so the day someone
  // adds coercion, this fails and says where the decision was made.
  it('passes a quoted aria value through UNCOERCED, string and all', async () => {
    const props = await mountAndRead(
      loweredArm('quoted-lowered', `aria-checked="true"`),
      9_107,
      'quoted-lowered',
    );
    const state = props.accessibilityState;
    expect(isRecord(state) ? state.checked : undefined).toBe('true');
  });
});
