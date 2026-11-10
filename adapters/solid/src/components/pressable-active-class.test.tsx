// `pressable` as a tag, and the only shape left — there is no "refused" arm any more. The failure
// mode this guards: a machine that presses without republishing the style gives no visual
// feedback while callbacks still fire.
//
// The pressed look is an `activeStyle` the engine swaps into slot 1 while pressed
// A functional `style={({pressed}) => ...}` compiles to this pair, the authored half must survive
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createLiveTree,
  installRecordingFabric,
  type ILiveNode,
} from '@symbiote-native/test-utils';
import { DEFAULT_MIN_PRESS_DURATION_MS } from '@symbiote-native/components';
// The press machine is keyed by intrinsic tag and installed only by this module. Without it the tag
// has no listeners at all and every assertion below fails as if the engine were broken — a false
// red that cost one wrong diagnosis today.
import '../register';
import { mount, unmount } from '../render';

const ROOT_TAG = 617;
const TARGET = 'active-class-target';
const TOUCH_START = 'topTouchStart';
const TOUCH_END = 'topTouchEnd';
const TOUCH_IDENTIFIER = 7;
const TINT = '#dd0031';

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);

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

function findCommitted(): ILiveNode {
  const node = live.findLive(live.appRoot(), n => n.payload.testID === TARGET);
  if (node === undefined)
    throw new Error(`no committed node with testID=${TARGET}`);
  return node;
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
  // `live` reads the CURRENT tree, so no accumulation trap remains — the reset is still needed
  // because `fabric.find` searches the creation log, which does accumulate across cases.
  fabric.reset();
});

afterEach(() => {
  unmount(ROOT_TAG);
});

describe('a pressable tag resolves its pressed style', () => {
  it('dims on touch-down and restores on lift, keeping the authored style', async () => {
    mount(ROOT_TAG, () => (
      <pressable
        testID={TARGET}
        style={{ opacity: 1, borderColor: TINT }}
        activeStyle={{ opacity: 0.4, borderColor: TINT }}
      >
        <text>tap</text>
      </pressable>
    ));
    await flush();
    expect(findCommitted().payload.opacity, 'resting').toBe(1);
    expect(findCommitted().payload.borderColor, 'authored style').toBe(TINT);

    touch(TOUCH_START);
    await flush();
    expect(findCommitted().payload.opacity, 'pressed').toBe(0.4);
    expect(findCommitted().payload.borderColor, 'authored survives press').toBe(
      TINT,
    );

    touch(TOUCH_END);
    await releaseSettled();
    expect(findCommitted().payload.opacity, 'released').toBe(1);
  });
});
