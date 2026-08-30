// A REFUSED Pressable still gets `.x:active`.
//
// The lowering leaves an element a component whenever the template must read the press state — a
// functional `style`, a render-prop child. That costs the tier-2 win, and it must not also cost the
// pressed STYLING: the machine still knows when the node is pressed, so one call into the engine
// applies the same `:active` rule a lowered `symbiote-pressable` would get
// (`.claude/rules/host-primitive-tier.md`).
//
// The seam is `host.setPressed` in pressable.tsx — the single point where press state changes —
// and it drives two sinks: the Solid signal (framework-visible) and `setHostPressed` (engine-
// visible). This file pins the second, which nothing else covers: every other Pressable test reads
// props the SIGNAL produced, so all of them stay green with the engine call deleted.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import { clearGlobalStyles, registerRules } from '@symbiote-native/engine';
import { mount, unmount } from '../render';
import { Pressable } from './pressable';

const ROOT_TAG = 613;
const TARGET = 'active-target';
const TOUCH_START = 'topTouchStart';
const TOUCH_END = 'topTouchEnd';
const TOUCH_IDENTIFIER = 7;

const fabric = installFabric();

// Same microtask flush every Pressable test uses: the renderer commits on a queueMicrotask, so
// nothing reaches the fake slot until that queue drains.
const flush = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
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

// The responder listeners hang off the CREATED node's instanceHandle, not off the committed
// node — `fabric.find` reads the immutable createNode snapshot, while clone-on-write hands back a
// new committed object on every update. Same split every other Pressable test observes.
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

// Read off the committed PAYLOAD, not off a `style` slot: fabricProps writes style keys straight
// into the one payload object (the shape RN itself uses), so a committed node carries `opacity`
// beside `testID` and has no `style` key at all.
function opacity(): unknown {
  return findCommitted().props.opacity;
}

beforeEach(() => {
  registerRules([
    {
      tokens: ['btn'],
      specificity: [0, 1, 0],
      order: 0,
      style: { opacity: 1 },
    },
    {
      tokens: ['btn', ':active'],
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

describe('a Pressable that stayed a component still resolves :active', () => {
  it('applies the pressed rule on touch-down and restores it on lift', async () => {
    mount(ROOT_TAG, () => (
      <Pressable testID={TARGET} class="btn">
        <symbiote-text>tap</symbiote-text>
      </Pressable>
    ));
    await flush();
    expect(opacity(), 'unpressed').toBe(1);

    touch(TOUCH_START);
    await flush();
    expect(opacity(), 'pressed -> .btn:active wins').toBe(0.6);

    touch(TOUCH_END);
    await flush();
    expect(opacity(), 'released -> back to .btn').toBe(1);
  });
});
