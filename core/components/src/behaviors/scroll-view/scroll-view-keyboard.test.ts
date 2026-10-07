// The four keyboard props of RN's ScrollView: its `scrollResponderKeyboard*` handlers call
// `props.onKeyboard{Will,Did}{Show,Hide}` with the keyboard event (ScrollView.js:1232-1257)

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installRecordingFabric } from '../../../../test-utils/src/index';
import {
  DeviceEventEmitter,
  clearHostBehaviors,
  createElement,
  createSurface,
  routeProp,
  setDeviceEventSource,
  type ISymbioteNode,
} from '@symbiote-native/engine';

import { descriptorFor } from '../../component-names';
import { registerScrollViewBehavior, SCROLL_VIEW_TAG } from './index';

// The app's device bus, standing in for RN's `DeviceEventEmitter`
const busListeners = new Map<string, Set<(...args: unknown[]) => void>>();
setDeviceEventSource({
  addListener(eventType, listener) {
    const set = busListeners.get(eventType) ?? new Set();
    busListeners.set(eventType, set);
    set.add(listener);
    return { remove: () => set.delete(listener) };
  },
  emit(eventType, ...args) {
    for (const listener of busListeners.get(eventType) ?? []) listener(...args);
  },
  listenerCount: eventType => busListeners.get(eventType)?.size ?? 0,
});

const fabric = installRecordingFabric();
let nextRootTag = 9_800;

const KEYBOARD_EVENT = {
  duration: 250,
  easing: 'keyboard',
  endCoordinates: { screenX: 0, screenY: 300, width: 390, height: 346 },
};

const PROP_BY_EVENT = [
  ['keyboardWillShow', 'onKeyboardWillShow'],
  ['keyboardWillHide', 'onKeyboardWillHide'],
  ['keyboardDidShow', 'onKeyboardDidShow'],
  ['keyboardDidHide', 'onKeyboardDidHide'],
] as const;

function mountScrollView(
  props: Readonly<Record<string, unknown>>,
): ISymbioteNode {
  const node = createElement(
    descriptorFor(SCROLL_VIEW_TAG).component,
    false,
    SCROLL_VIEW_TAG,
  );
  for (const [key, value] of Object.entries(props)) routeProp(node, key, value);
  const surface = createSurface((nextRootTag += 1));
  surface.appendChild(node);
  surface.commit();
  return node;
}

beforeEach(() => {
  registerScrollViewBehavior();
});

afterEach(() => {
  clearHostBehaviors();
  fabric.reset();
});

describe('ScrollView keyboard props', () => {
  it.each(PROP_BY_EVENT)(
    'calls %s handler %s with the keyboard event',
    (eventName, propName) => {
      const handler = vi.fn();
      mountScrollView({ [propName]: handler });

      DeviceEventEmitter.emit(eventName, KEYBOARD_EVENT);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(KEYBOARD_EVENT);
    },
  );

  it('keeps each handler to its own event', () => {
    const willShow = vi.fn();
    const didHide = vi.fn();
    mountScrollView({
      onKeyboardWillShow: willShow,
      onKeyboardDidHide: didHide,
    });

    DeviceEventEmitter.emit('keyboardDidShow', KEYBOARD_EVENT);
    DeviceEventEmitter.emit('keyboardWillHide', KEYBOARD_EVENT);

    expect(willShow).not.toHaveBeenCalled();
    expect(didHide).not.toHaveBeenCalled();
  });

  it('calls the handler the app wrote last', () => {
    const first = vi.fn();
    const second = vi.fn();
    const node = mountScrollView({ onKeyboardDidShow: first });
    routeProp(node, 'onKeyboardDidShow', second);

    DeviceEventEmitter.emit('keyboardDidShow', KEYBOARD_EVENT);

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('stops calling a handler once the app removes it', () => {
    const handler = vi.fn();
    const node = mountScrollView({ onKeyboardDidShow: handler });
    routeProp(node, 'onKeyboardDidShow', undefined);

    DeviceEventEmitter.emit('keyboardDidShow', KEYBOARD_EVENT);

    expect(handler).not.toHaveBeenCalled();
  });
});
