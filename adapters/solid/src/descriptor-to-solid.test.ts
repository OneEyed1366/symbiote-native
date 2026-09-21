// The Descriptor -> Solid bridge, driven through the real renderer seam onto the recording host.
// Not a pure mapping test like React's descriptor-bridge.test.ts: React's bridge returns elements
// its own reconciler then diffs, so mapping IS the contract there. Here the bridge owns the whole
// update path, so what has to be proven is that a reactive change reaches the props of the SAME
// native node — a bridge that rebuilt the tree would look identical in a snapshot and be broken on
// a device (a new node loses its Fabric tag, its native-owned state, and every imperative command
// aimed at the old one).
//
// Negative group: the shape guard. A render fn that stops being shape-stable must fail loudly
// rather than paint a half-updated tree.

import { createSignal } from 'solid-js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { el, txt, type IDescriptorChild } from '@symbiote-native/components';
import {
  createLiveTree,
  installRecordingFabric,
  type ILiveNode,
} from '@symbiote-native/test-utils';
import { descriptorToSolid } from './descriptor-to-solid';
import { mount, unmount } from './render';

const ROOT_TAG = 811;

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

// The LIVE tree, not the recording — the record holds a node as it was CREATED, with its props
// frozen at that moment (symbiote-engine-core §8).
function committed(
  predicate: (node: ILiveNode) => boolean,
): ILiveNode | undefined {
  return live.findLive(live.appRoot(), predicate);
}

describe('descriptorToSolid', () => {
  describe('Positive', () => {
    // why: this is the seam every shared render fn's output crosses to become real native views —
    // element type, props and nested text must all survive it, or every component built on
    // @symbiote-native/components paints nothing on Solid.
    it('materializes a descriptor tree as committed Fabric nodes', async () => {
      mount(ROOT_TAG, () =>
        descriptorToSolid(() =>
          el('view', { testID: 'bridge' }, [
            txt({ testID: 'label' }, ['hello']),
          ]),
        ),
      );
      await tick();

      const view = committed(node => node.payload.testID === 'bridge');
      expect(view?.viewName).toBe('RCTView');
      expect(committed(node => node.payload.testID === 'label')?.viewName).toBe(
        'RCTText',
      );
      expect(
        committed(
          node =>
            node.viewName === 'RCTRawText' && node.payload.text === 'hello',
        ),
      ).toBeDefined();
    });

    // why: THE reason this bridge takes an accessor instead of a Descriptor. A Solid component body
    // runs once, so a value-taking bridge would freeze at mount; a bridge that rebuilt from a fresh
    // Descriptor would swap the node out from under Fabric. Reading the node's IDENTITY is what
    // tells those three outcomes apart — the prop moved AND it is the same node it moved on.
    it('re-props the SAME native node on a reactive change', async () => {
      const [opacity, setOpacity] = createSignal(0.5);
      mount(ROOT_TAG, () =>
        descriptorToSolid(() =>
          el('view', { testID: 'live', opacity: opacity() }),
        ),
      );
      await tick();
      // Node IDENTITY rather than a creation count: a rebuild that netted out even would satisfy a
      // count, and the identity moving is the thing this case forbids.
      const liveProbe = (): ILiveNode | undefined =>
        committed(node => node.payload.testID === 'live');
      const hostAtMount = liveProbe()?.handle;
      expect(liveProbe()?.payload.opacity).toBe(0.5);

      setOpacity(0.25);
      await tick();

      expect(liveProbe()?.payload.opacity).toBe(0.25);
      expect(liveProbe()?.handle, 'no second native node was created').toBe(
        hostAtMount,
      );
    });

    // why: a string child takes a different update path than a prop (replaceText, not routeProp),
    // and it has the same identity requirement — RCTRawText must be re-texted in place, not
    // recreated, or a <Text> would churn a native node on every character.
    it('re-texts a string child in place', async () => {
      const [label, setLabel] = createSignal('first');
      mount(ROOT_TAG, () =>
        descriptorToSolid(() => txt({ testID: 'text' }, [label()])),
      );
      await tick();
      const rawAtMount = committed(
        node => node.viewName === 'RCTRawText',
      )?.handle;

      setLabel('second');
      await tick();

      expect(
        committed(node => node.viewName === 'RCTRawText')?.payload.text,
      ).toBe('second');
      // Identity again: the raw text has to be RE-TEXTED, not rebuilt.
      expect(committed(node => node.viewName === 'RCTRawText')?.handle).toBe(
        rawAtMount,
      );
    });

    // why: Solid's spread walks only the current key set and never resets one that vanished, so a
    // prop the render fn STOPS emitting would stick on the native view. This is the live path, not
    // a synthetic edge: resolveAccessibilityProps returns its input untouched until an aria-* alias
    // holds a VALUE, so a caller's `aria-label` going undefined drops the folded
    // `accessibilityLabel` key entirely — and a screen reader would keep announcing it.
    it('clears a prop the descriptor stops emitting', async () => {
      const [label, setLabel] = createSignal<string | undefined>('Wi-Fi');
      mount(ROOT_TAG, () =>
        descriptorToSolid(() => {
          const current = label();
          return el(
            'view',
            current === undefined
              ? { testID: 'aria' }
              : { testID: 'aria', accessibilityLabel: current },
          );
        }),
      );
      await tick();
      const aria = (): ILiveNode | undefined =>
        committed(node => node.payload.testID === 'aria');
      expect(aria()?.payload.accessibilityLabel).toBe('Wi-Fi');

      setLabel(undefined);
      await tick();

      // ABSENT, not null: the literal null was the CLONE PROTOCOL's spelling of "reset to the
      // default", held only inside the diff the stand-in merged. The engine's op stream says the
      // same thing with `NO_VALUE`, and a host replaying that op deletes the key.
      expect(Object.hasOwn(aria()?.payload ?? {}, 'accessibilityLabel')).toBe(
        false,
      );
      // …and the half that proves the engine ACTED: the record carried the label after the mount
      // above, so its being gone from the record means a clearing op was sent for it.
      const recorded = fabric.find(node => node.props.testID === 'aria');
      expect(Object.hasOwn(recorded?.props ?? {}, 'accessibilityLabel')).toBe(
        false,
      );
    });
  });

  describe('Negative', () => {
    // why: the build-once model is only sound while a render fn's Descriptor keeps a constant
    // shape. If one ever stops being shape-stable, the cached tree no longer describes the output —
    // failing loudly names the real bug, where silently re-propping the wrong node would surface
    // much later as a mispainted screen.
    it('throws when a child changes from text to an element between renders', async () => {
      const [child, setChild] = createSignal<IDescriptorChild>('text');
      mount(ROOT_TAG, () =>
        descriptorToSolid(() => txt({ testID: 'shape' }, [child()])),
      );
      await tick();

      expect(() => setChild(el('text'))).toThrow('Descriptor shape changed');
    });

    // why: the node's type is read ONCE, at build. A later type change would otherwise be the
    // quietest failure of all — the new descriptor's props land on the OLD host element, so the
    // screen paints a plausible-looking wrong view instead of erroring.
    it('throws when the descriptor type changes between renders', async () => {
      const [type, setType] = createSignal('view');
      mount(ROOT_TAG, () =>
        descriptorToSolid(() => el(type(), { testID: 'type-drift' })),
      );
      await tick();

      expect(() => setType('text')).toThrow('Descriptor shape changed');
    });

    // why: children are mounted by position in one pass at build, so an ADDED child is never
    // visited again — it would simply never reach the screen, with nothing to show it went missing.
    // A shrunk list already throws via childAt; this is the other half.
    it('throws when the child list grows between renders', async () => {
      const [children, setChildren] = createSignal<IDescriptorChild[]>(['one']);
      mount(ROOT_TAG, () =>
        descriptorToSolid(() => txt({ testID: 'grow' }, children())),
      );
      await tick();

      expect(() => setChildren(['one', 'two'])).toThrow(
        'Descriptor shape changed',
      );
    });
  });
});
