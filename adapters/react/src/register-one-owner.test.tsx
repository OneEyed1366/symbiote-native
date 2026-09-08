// ONE OWNER PER NODE — the collision `register.ts` has to be safe against, measured by mounting
// rather than by reading which tag a render fn emits.
//
// React had no registration at all until `register.ts`, so it is the one adapter that has never
// been exposed to this: the engine's registry is keyed by TAG, and any path that emits a tag gets
// its machine. A wrapper that runs its own lifecycle AND renders the plain tag would give one node
// two machines — `setInputFocused` twice per focus, `mostRecentEventCount` written from two places
// — with every existing test green, because both tags resolve to the SAME Fabric view and the
// committed tree cannot tell them apart. The `-managed` twins exist to keep them apart; see the
// pair's declaration in `core/components/src/component-names/shared.ts`.
//
// SO THE OBSERVABLE IS THE ATTACH, not the view name. Each plain tag gets a MARKER behavior that
// records its own attach, and the wrappers are then mounted. A wrapper on the `-managed` twin
// records nothing; a wrapper sharing its tag records once. Reading the render fn's output instead
// would prove what `core/components` emits and say nothing about what React's wrapper does with it.
//
// The markers REPLACE the real behaviors for this file, which is why the presence assertions live
// in `register.test.ts` and not here. Two files, two questions.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  Image,
  InputAccessoryView,
  Pressable,
  Switch,
  TextInput,
  Text,
  mount,
  unmount,
} from '@symbiote-native/react';
import { registerHostBehavior } from '@symbiote-native/engine';
import {
  IMAGE_TAG,
  INPUT_ACCESSORY_VIEW_TAG,
  PRESSABLE_TAG,
  SWITCH_TAG,
  TEXT_INPUT_MULTILINE_TAG,
  TEXT_INPUT_TAG,
} from '@symbiote-native/components';
import { installFabric } from '@symbiote-native/test-utils';

const ROOT_TAG = 733;

const MARKED_TAGS = [
  PRESSABLE_TAG,
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

describe('React wrappers own their nodes alone', () => {
  // why: THE positive control, and every row below is vacuous without it — a marker that never
  // fires and a wrapper that never collides produce the identical empty array. Bare tags are also
  // what an app writes now, so this doubles as the proof the registration reaches them at all.
  it.each([
    ['pressable', <pressable key="p" />, PRESSABLE_TAG],
    ['text-input', <text-input key="t" />, TEXT_INPUT_TAG],
    ['switch', <switch key="s" />, SWITCH_TAG],
    ['image', <image key="i" />, IMAGE_TAG],
  ])('control: a bare <%s> attaches its behavior', (_name, element, tag) => {
    expect(attachedWhileMounting(element)).toEqual([tag]);
  });

  // why: each of these wrappers runs its own lifecycle, so it must render the `-managed` twin (or,
  // for Pressable, a plain `view`) and pick up NO engine machine. A regression here is a wrapper
  // quietly switching to the plain tag — invisible in the committed tree, since both spellings
  // resolve to one Fabric view.
  it.each([
    ['Pressable', <Pressable key="p" />],
    ['TextInput', <TextInput key="t" />],
    ['TextInput multiline', <TextInput key="tm" multiline />],
    ['Switch', <Switch key="s" />],
  ])('%s renders a tag no behavior is registered on', (_name, element) => {
    expect(attachedWhileMounting(element)).toEqual([]);
  });

  // why: the other half of the grid, and it is a MUST-attach rather than an oversight. Image and
  // InputAccessoryView are fold-only — no machine, no owned listener — so they share the wrapper's
  // tag on purpose and the fold simply runs a second time. That is safe only because the mapping is
  // idempotent, which `core/components/src/behaviors/{image,input-accessory-view}.test.ts` assert.
  // Asserting the attach here is what stops the sharing from being assumed.
  it.each([
    ['Image', <Image key="i" source={{ uri: 'x' }} />, IMAGE_TAG],
    [
      'InputAccessoryView',
      <InputAccessoryView key="a" nativeID="bar">
        <Text>ok</Text>
      </InputAccessoryView>,
      INPUT_ACCESSORY_VIEW_TAG,
    ],
  ])(
    '%s shares its tag with the behavior, by design',
    (_name, element, tag) => {
      expect(attachedWhileMounting(element)).toEqual([tag]);
    },
  );
});
