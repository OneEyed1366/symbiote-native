// TextInput's responder yield, against RN's TextInput.js: `rejectResponderTermination = true` by
// default, and its Pressability takes `cancelable: Platform.OS === 'ios' ? !reject : null` — iOS
// keeps the gesture unless the app opts in; Android leaves Pressability's own default (yield).
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installRecordingFabric } from '../../../test-utils/src/index';
import {
  clearHostBehaviors,
  createElement,
  createSurface,
  Platform,
  routeProp,
  type IListener,
  type ISymbioteEvent,
  type ISymbioteNode,
} from '@symbiote-native/engine';

import { registerTextInputBehavior, TEXT_INPUT_TAG } from './text-input';

installRecordingFabric();
let nextRootTag = 7400;
const originalOs = Platform.OS;

const TOUCH: ISymbioteEvent = {
  nativeEvent: { pageX: 0, pageY: 0, locationX: 0, locationY: 0 },
};

function setOs(os: string): void {
  Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
}

function listenerOf(node: ISymbioteNode, name: string): IListener {
  const listener = node.listeners?.get(name);
  if (listener === undefined) throw new Error(`no "${name}" listener`);
  return listener;
}

function yieldsResponder(props: Record<string, unknown>): unknown {
  const node = createElement(
    'RCTSinglelineTextInputView',
    false,
    TEXT_INPUT_TAG,
  );
  for (const [key, value] of Object.entries(props)) routeProp(node, key, value);
  const surface = createSurface((nextRootTag += 1));
  surface.appendChild(node);
  surface.commit();
  listenerOf(node, 'pressIn')(TOUCH);
  return listenerOf(node, 'responderTerminationRequest')(TOUCH);
}

beforeEach(() => registerTextInputBehavior());
afterEach(() => {
  setOs(originalOs);
  clearHostBehaviors();
});

describe('text input responder yield (Positive — no throwing path)', () => {
  // why: iOS default `rejectResponderTermination = true` -> cancelable false: a parent ScrollView
  // cannot steal a touch that started on the field.
  it('keeps the gesture on iOS by default, yields when the app opts in', () => {
    setOs('ios');
    expect(yieldsResponder({})).toBe(false);
    // Anything but `false` is consent to the engine (no answer = implicit yes).
    expect(yieldsResponder({ rejectResponderTermination: false })).not.toBe(
      false,
    );
  });

  // why: Android passes `cancelable: null`, i.e. Pressability's default — yield.
  it('yields on Android whatever rejectResponderTermination says', () => {
    setOs('android');
    expect(yieldsResponder({})).not.toBe(false);
    expect(yieldsResponder({ rejectResponderTermination: true })).not.toBe(
      false,
    );
  });
});
