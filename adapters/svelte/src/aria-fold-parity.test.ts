// RN's `role` / `aria-*` keys must reach the engine identically down both spellings an app can now
// write: attributes on the bare tag, and one `p={{…}}` bag.
//
// The FOLD is the device's rule (`foldAriaProps`, `SymbioteFabricProps.cpp`) and this harness holds
// no copy of it, so what this file asserts is the half above it — which was always the half that
// made it a Svelte file rather than an engine one. **The rule reads the hyphenated name literally**,
// so anything that renamed or reshaped a key on the way down leaves it looking at a bag it does not
// recognise, and the failure is silent: accessibility simply stops, on device, with every suite
// green. Svelte's compiler lowercases every static attribute name, which makes that a live hazard
// here and not a theoretical one.
//
// The rule's own eleven cases: `core/engine/cpp/tests/js/aria-payload.itest.ts`.
//
// It had a THIRD arm until the wrappers were deleted; the two left are the two an app has.
import { afterAll, describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
import {
  createLiveTree,
  installRecordingFabric,
} from '@symbiote-native/test-utils';
import './register';
import { mount, unmount } from './render';

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined)
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);

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

// The payload is what the engine is handed, so the search key and the assertions both read it.
function committedPayload(testID: string): Record<string, unknown> {
  const found = live.findLive(
    live.appRoot(),
    node => node.payload.testID === testID,
  );
  if (found === undefined)
    throw new Error(`no committed node carries testID ${testID}`);
  return found.payload;
}

// Mount AND read in one call, with the recording cleared first. `appRoot()` searches the CREATION
// log, so mounting two arms and then reading both finds the FIRST arm's surface for each — the
// mirror-tree version of this file had the same trap from the other end (it kept only the LAST
// root) and threw `no committed node carries testID …`. Each arm is read while it is the only tree.
async function mountAndRead(
  source: string,
  rootTag: number,
  testID: string,
): Promise<Record<string, unknown>> {
  fabric.reset();
  await mountSource(source, rootTag);
  const props = committedPayload(testID);
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
      // The engine reads the HYPHENATED form literally (`bag["aria-label"]`), so the authored
      // spelling IS the contract — a camelised key is invisible to the rule and would commit raw.
      // Svelte is the adapter where this is a live hazard rather than a theoretical one: its
      // compiler lowercases every static attribute name (`fix_attribute_casing`), which is the
      // whole reason `canonical-prop-names.ts` exists.
      expect(props.role, `${arm} role`).toBe('button');
      expect(props['aria-label'], `${arm} label`).toBe('close');
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
      // Both halves must ARRIVE, under both spellings — which of them wins is the engine's rule and
      // it cannot apply a precedence to a bag missing one side. The composite has to survive as an
      // OBJECT through a `p={{…}}` bag as well as through an attribute, which is the half a bag arm
      // is here to catch.
      expect(props.accessibilityState, `${arm} state`).toMatchObject({
        checked: false,
        busy: true,
      });
      expect(props['aria-checked'], `${arm} alias`).toBe(true);
    }
  });

  // A QUOTED aria attribute is a STRING in every one of these templates — `aria-checked="true"`
  // yields `'true'`, not `true` — and nothing anywhere coerces it: not this adapter, and not the
  // engine's rule, which reads the value through as-is. So what eventually lands in
  // `accessibilityState.checked` is the string, which is not what RN's native side expects
  // (boolean | 'mixed').
  //
  // Asserted at THIS layer now rather than on the folded composite: the string is produced here, by
  // the template, and that is the fact this file can still see. The consequence downstream — that
  // the rule passes it along uncoerced — belongs to the rule and is pinned beside it. Recorded as an
  // assertion rather than a comment so the day someone adds coercion, one of the two fails and says
  // which layer made the decision.
  it('passes a quoted aria value through UNCOERCED, string and all', async () => {
    const props = await mountAndRead(
      attributeArm('quoted-attributes', `aria-checked="true"`),
      9_107,
      'quoted-attributes',
    );
    expect(props['aria-checked']).toBe('true');
  });
});
