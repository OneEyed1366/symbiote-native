// ONE OWNER PER NODE — measured by mounting, never by reading which tag a render fn emits.
//
// The engine's registry is keyed by TAG, and any path that emits a tag gets its machine. While
// React still shipped wrappers, the hazard was a wrapper running its own lifecycle AND rendering
// the plain tag: one node, two machines — `setInputFocused` twice per focus,
// `mostRecentEventCount` written from two places — with every test green, because both spellings
// resolve to the SAME Fabric view and the committed tree cannot tell them apart. That is what the
// `-managed` twins were for.
//
// EVERY ONE OF THOSE WRAPPERS IS GONE, so the collision is unreachable from this adapter and the
// twins are dead here: nothing in `adapters/react` emits `text-input-managed` or `switch-managed`
// any more. What survives is the half that was always the positive control and is now the whole
// subject — a bare tag, which is what an app writes, must attach its behavior EXACTLY ONCE.
//
// Keeping it is not ceremony. An attach that stops happening is silent: the tag still commits the
// right native view, the tree still looks correct, and only the machine is missing — which is
// precisely the state React was in before `register.ts` existed.
//
// The markers REPLACE the real behaviors for this file, which is why the presence assertions live
// in `register.test.ts` and not here. Two files, two questions.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Text, mount, unmount } from '@symbiote-native/react';
import { registerHostBehavior } from '@symbiote-native/engine';
import {
  IMAGE_TAG,
  INPUT_ACCESSORY_VIEW_TAG,
  PRESSABLE_TAG,
  SWITCH_TAG,
  TEXT_INPUT_MULTILINE_TAG,
  TEXT_INPUT_TAG,
  TOUCHABLE_HIGHLIGHT_TAG,
  TOUCHABLE_OPACITY_TAG,
} from '@symbiote-native/components';
import { installFabric } from '@symbiote-native/test-utils';

const ROOT_TAG = 733;

const MARKED_TAGS = [
  PRESSABLE_TAG,
  TOUCHABLE_OPACITY_TAG,
  TOUCHABLE_HIGHLIGHT_TAG,
  TEXT_INPUT_TAG,
  TEXT_INPUT_MULTILINE_TAG,
  SWITCH_TAG,
  IMAGE_TAG,
  INPUT_ACCESSORY_VIEW_TAG,
];

let attached: string[] = [];

// Top-level, after the imports have run `./register` — so these overwrite the real behaviors.
for (const tag of MARKED_TAGS) {
  registerHostBehavior(tag, {
    attach: () => attached.push(tag),
    detach: () => undefined,
  });
}

const fabric = installFabric();

beforeEach(() => {
  fabric.reset();
  attached = [];
});
afterEach(() => unmount(ROOT_TAG));

function attachedWhileMounting(element: React.ReactElement): string[] {
  mount(ROOT_TAG, element);
  return attached;
}

describe('a bare tag owns its node alone', () => {
  // why: EXACTLY ONCE, asserted as an equal array rather than a `toContain` — a second entry is
  // the two-owner bug this file is named for, and a containment check cannot see it.
  it.each([
    ['pressable', <pressable key="p" />, PRESSABLE_TAG],
    ['touchable-opacity', <touchable-opacity key="o" />, TOUCHABLE_OPACITY_TAG],
    [
      'touchable-highlight',
      <touchable-highlight key="h" />,
      TOUCHABLE_HIGHLIGHT_TAG,
    ],
    ['text-input', <text-input key="t" />, TEXT_INPUT_TAG],
    ['switch', <switch key="s" />, SWITCH_TAG],
    ['image', <image key="i" />, IMAGE_TAG],
  ])('<%s> attaches its behavior once', (_name, element, tag) => {
    expect(attachedWhileMounting(element)).toEqual([tag]);
  });

  // why: `multiline` picks a DIFFERENT native view, so it is a different registration and a
  // separate row — a fold that resolved the tag but not the behavior would leave this one empty.
  it('<text-input multiline> attaches the multiline behavior', () => {
    expect(attachedWhileMounting(<text-input key="tm" multiline />)).toEqual([
      TEXT_INPUT_MULTILINE_TAG,
    ]);
  });

  // why: the one tag here that takes children, so it also proves the attach is not skipped for a
  // node whose subtree is built before the behavior runs.
  it('<input-accessory-view> attaches its behavior once', () => {
    expect(
      attachedWhileMounting(
        <input-accessory-view key="a" nativeID="bar">
          <Text>ok</Text>
        </input-accessory-view>,
      ),
    ).toEqual([INPUT_ACCESSORY_VIEW_TAG]);
  });
});
