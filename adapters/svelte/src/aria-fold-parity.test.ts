// RN's `role` / `aria-*` fold must reach the committed payload identically down both spellings an
// app can now write: attributes on the bare tag, and one `p={{…}}` bag.
//
// The fold itself lives in the ENGINE (`core/engine/src/accessibility-props.ts`, called from
// `fabricProps`), i.e. BELOW this adapter. That placement is what this file is checking from above:
// anything that renamed or reshaped one of those keys on the way down would leave the fold looking
// at a bag it does not recognise, and the failure is silent — accessibility simply stops, on
// device, with every suite green.
//
// It had a THIRD arm until the wrappers were deleted (a lowered `<View>` and the `View.svelte` that
// refused). Both are gone; the two arms left are the two an app has.
import { afterAll, describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
import { installFabric } from '@symbiote-native/test-utils';
import './register';
import { mount, unmount } from './render';

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined)
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });

const fabric = installFabric();

const SRC_DIR = __dirname;
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

// Mount AND read in one call. `fabric.appRoot()` is the CURRENT root, so mounting two arms and then
// reading both finds only the last — the first version of this file did exactly that and threw `no
// committed node carries testID …`, which is the harness failing loudly rather than an arm
// disagreeing. Each arm is now read while it is the live tree.
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
  rmSync(PROBE_OUT, { force: true });
});

// One authored intent per case, spelled two ways: as attributes the compiler writes through
// `setAttribute`, and as the single `p` property set. The two reach `routeProp` by different
// mechanisms inside the shim, which is why both are worth a mount.
const attributeArm = (testID: string, attributes: string): string =>
  `<view testID="${testID}" ${attributes}></view>`;

const bagArm = (testID: string, bagEntries: string): string =>
  `<view p={{ testID: "${testID}", ${bagEntries} }}></view>`;

describe('the aria/role fold reaches Fabric on both spellings', () => {
  it('folds role and aria-label, and leaves neither raw key behind', async () => {
    const arms = {
      attributes: await mountAndRead(
        attributeArm('aria-attributes', `role="button" aria-label="close"`),
        9_101,
        'aria-attributes',
      ),
      bag: await mountAndRead(
        bagArm('aria-bag', `role: "button", "aria-label": "close"`),
        9_103,
        'aria-bag',
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
      // The camelised spellings are what a rewrite would produce if it normalised the key: the
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
    const arms = {
      attributes: await mountAndRead(
        attributeArm(
          'state-attributes',
          `accessibilityState={{ checked: false, busy: true }} aria-checked={true}`,
        ),
        9_104,
        'state-attributes',
      ),
      bag: await mountAndRead(
        bagArm(
          'state-bag',
          `accessibilityState: { checked: false, busy: true }, "aria-checked": true`,
        ),
        9_106,
        'state-bag',
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
      attributeArm('quoted-attributes', `aria-checked="true"`),
      9_107,
      'quoted-attributes',
    );
    const state = props.accessibilityState;
    expect(isRecord(state) ? state.checked : undefined).toBe('true');
  });
});
