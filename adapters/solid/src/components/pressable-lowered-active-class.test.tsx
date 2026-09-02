// The LOWERED twin of pressable-active-class.test.tsx, and the shape the canary actually ships.
//
// That file pins a REFUSED Pressable — the component path, where `host.setPressed` drives the
// engine call itself. Nothing covered the other side: an element the transform turned into
// `symbiote-pressable`, whose press machine lives on the node. Reported from device 2026-08-31 as
// "buttons give no visual feedback, callbacks fire", which is exactly what a machine that presses
// without republishing the style looks like.
//
// The subject is `examples/solid/components/ActionButton` verbatim in shape — a class for the look,
// an OBJECT style for the per-instance tint, a zero-arity child — because the two style halves are
// the interesting part: slot 0 must re-resolve through `:active` while slot 1 keeps the authored
// object.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import { DEFAULT_MIN_PRESS_DURATION_MS } from '@symbiote-native/components';
import { clearGlobalStyles, registerRules } from '@symbiote-native/engine';
// The press machine is keyed by intrinsic tag and installed only by this module. Without it a
// lowered element has no listeners at all and every assertion below fails as if the engine were
// broken — a false red that cost one wrong diagnosis today.
import '../register';
import { mount, unmount } from '../render';

const ROOT_TAG = 617;
const TARGET = 'lowered-active-target';
const TOUCH_START = 'topTouchStart';
const TOUCH_END = 'topTouchEnd';
const TOUCH_IDENTIFIER = 7;
const TINT = '#dd0031';

const fabric = installFabric();

const flush = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

// RN's active-duration floor defers the release, so a microtask flush still reads the pressed
// value. Waited off the constant, not a literal, so it tracks the floor.
const releaseSettled = async (): Promise<void> => {
  await new Promise<void>(resolve =>
    setTimeout(resolve, DEFAULT_MIN_PRESS_DURATION_MS + 10),
  );
  await flush();
};

function findCommitted(): IFakeNode {
  const walk = (node: IFakeNode): IFakeNode | undefined => {
    if (node.props.testID === TARGET) return node;
    for (const child of node.children) {
      const hit = walk(child);
      if (hit !== undefined) return hit;
    }
    return undefined;
  };
  for (const root of fabric.committed) {
    const hit = walk(root);
    if (hit !== undefined) return hit;
  }
  throw new Error(`no committed node with testID=${TARGET}`);
}

function responderHandle(): unknown {
  const node = fabric.find(n => n.props.testID === TARGET);
  if (node === undefined)
    throw new Error(`no node created with testID=${TARGET}`);
  return node.instanceHandle;
}

function touch(type: string): void {
  const point = {
    pageX: 5,
    pageY: 5,
    identifier: TOUCH_IDENTIFIER,
    timestamp: 0,
  };
  fabric.fireEvent(responderHandle(), type, {
    pageX: 5,
    pageY: 5,
    touches: type === TOUCH_END ? [] : [point],
    changedTouches: [point],
  });
}

beforeEach(() => {
  // `fabric.committed` ACCUMULATES across cases, and `findCommitted` returns the first match — so
  // without this the second case reads the first case's node and asserts against a tree that is no
  // longer mounted. It cost one false red here before it was spotted.
  fabric.reset();
  registerRules([
    {
      tokens: ['action-button'],
      specificity: [0, 1, 0],
      order: 0,
      style: { opacity: 1 },
    },
    {
      tokens: ['action-button', ':active'],
      specificity: [0, 2, 0],
      order: 1,
      style: { opacity: 0.6 },
    },
  ]);
});

afterEach(() => {
  unmount(ROOT_TAG);
  clearGlobalStyles();
});

describe('a LOWERED Pressable resolves :active', () => {
  it('dims on touch-down and restores on lift, keeping the authored style', async () => {
    mount(ROOT_TAG, () => (
      <symbiote-pressable
        testID={TARGET}
        class="action-button"
        style={{ borderColor: TINT }}
      >
        <symbiote-text>tap</symbiote-text>
      </symbiote-pressable>
    ));
    await flush();
    expect(findCommitted().props.opacity, 'unpressed').toBe(1);
    // The control that makes the row above mean something: if the authored half never landed, an
    // opacity of 1 would also be what a node with no class at all commits.
    expect(findCommitted().props.borderColor, 'authored style').toBe(TINT);

    touch(TOUCH_START);
    await flush();
    expect(findCommitted().props.opacity, 'pressed').toBe(0.6);
    expect(findCommitted().props.borderColor, 'authored survives press').toBe(
      TINT,
    );

    touch(TOUCH_END);
    await releaseSettled();
    expect(findCommitted().props.opacity, 'released').toBe(1);
  });

  // The OTHER half of the lowered surface: a functional `style={({pressed}) => …}` is specialised by
  // the transform into a resting `style` plus an `activeStyle`, which the engine swaps into SLOT 1
  // while pressed. Nothing else covers it, and it is the idiom the ecosystem writes — the CSS route
  // above is the one an app has to be migrated to.
  it('swaps the specialised activeStyle in while pressed', async () => {
    mount(ROOT_TAG, () => (
      <symbiote-pressable
        testID={TARGET}
        style={{ opacity: 1 }}
        activeStyle={{ opacity: 0.4 }}
      >
        <symbiote-text>tap</symbiote-text>
      </symbiote-pressable>
    ));
    await flush();
    expect(findCommitted().props.opacity, 'resting').toBe(1);

    touch(TOUCH_START);
    await flush();
    expect(findCommitted().props.opacity, 'pressed').toBe(0.4);

    touch(TOUCH_END);
    await releaseSettled();
    expect(findCommitted().props.opacity, 'released').toBe(1);
  });
});
