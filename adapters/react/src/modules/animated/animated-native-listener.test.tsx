// A JS listener on a native-driven value still fires: `addListener` asks native to stream updates
// back as `onAnimatedValueUpdate` on RN's device bus and routes them to the listener
// Removing the last listener stops the stream

import { type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, Animated } from '@symbiote-native/react';
import {
  emitRnDeviceEvent,
  installRecordingFabric,
} from '@symbiote-native/test-utils';

// ---- fake NativeAnimatedTurboModule (records calls) ----------------------

type INativeCall = {
  method: string;
  args: unknown[];
};
const nativeCalls: INativeCall[] = [];

function record(method: string): (...args: unknown[]) => void {
  return (...args: unknown[]) => {
    nativeCalls.push({ method, args });
  };
}

const fakeNativeAnimated = {
  createAnimatedNode(tag: number, config: unknown): void {
    nativeCalls.push({ method: 'createAnimatedNode', args: [tag, config] });
  },
  connectAnimatedNodes: record('connectAnimatedNodes'),
  disconnectAnimatedNodes: record('disconnectAnimatedNodes'),
  connectAnimatedNodeToView: record('connectAnimatedNodeToView'),
  disconnectAnimatedNodeFromView: record('disconnectAnimatedNodeFromView'),
  restoreDefaultValues: record('restoreDefaultValues'),
  dropAnimatedNode: record('dropAnimatedNode'),
  startAnimatingNode: record('startAnimatingNode'),
  stopAnimation: record('stopAnimation'),
  setAnimatedNodeValue: record('setAnimatedNodeValue'),
  setAnimatedNodeOffset: record('setAnimatedNodeOffset'),
  flattenAnimatedNodeOffset: record('flattenAnimatedNodeOffset'),
  extractAnimatedNodeOffset: record('extractAnimatedNodeOffset'),
  startListeningToAnimatedNodeValue: record(
    'startListeningToAnimatedNodeValue',
  ),
  stopListeningToAnimatedNodeValue: record('stopListeningToAnimatedNodeValue'),
  getValue: record('getValue'),
  addAnimatedEventToView: record('addAnimatedEventToView'),
  removeAnimatedEventFromView: record('removeAnimatedEventFromView'),
  addListener: record('addListener'),
  removeListeners: record('removeListeners'),
};
Object.assign(globalThis, {
  nativeModuleProxy: { NativeAnimatedTurboModule: fakeNativeAnimated },
});

const fabric = installRecordingFabric();
const ROOT_TAG = 41;

function callsOf(method: string): INativeCall[] {
  return nativeCalls.filter(call => call.method === method);
}

beforeEach(() => {
  fabric.reset();
  nativeCalls.length = 0;
});
afterEach(() => unmount(ROOT_TAG));

describe('Animated native value listener', () => {
  it('streams native updates to a JS listener and stops on the last unsubscribe', () => {
    const opacity = new Animated.Value(0);

    function App(): ReactElement {
      return <Animated.View style={{ opacity }} />;
    }

    mount(ROOT_TAG, <App />);

    // useNativeDriver makes `opacity` native; capture the native tag it was created as.
    Animated.timing(opacity, {
      toValue: 1,
      duration: 100,
      useNativeDriver: true,
    }).start();

    const valueCreate = callsOf('createAnimatedNode').find(call => {
      const config = call.args[1];
      return (
        typeof config === 'object' &&
        config !== null &&
        'type' in config &&
        config.type === 'value'
      );
    });
    const valueTag = valueCreate?.args[0];
    expect(typeof valueTag).toBe('number');

    // a JS listener on the native value asks native to stream updates
    let received: number | undefined;
    const listenerId = opacity.addListener(state => {
      received = state.value;
    });

    expect(
      callsOf('startListeningToAnimatedNodeValue').some(
        c => c.args[0] === valueTag,
      ),
    ).toBe(true);

    // native reports a mid-flight value via the device bus -> the JS listener fires
    emitRnDeviceEvent('onAnimatedValueUpdate', { tag: valueTag, value: 0.5 });
    expect(received).toBe(0.5);
    expect(opacity.__getValue()).toBe(0.5);

    // removing the last listener stops the native stream
    opacity.removeListener(listenerId);
    expect(
      callsOf('stopListeningToAnimatedNodeValue').some(
        c => c.args[0] === valueTag,
      ),
    ).toBe(true);

    received = undefined;
    emitRnDeviceEvent('onAnimatedValueUpdate', { tag: valueTag, value: 0.9 });
    expect(received).toBeUndefined();
  });

  // На iOS `RCTEventEmitter` не шлёт событие без счётчика наблюдателей, RN передаёт ему модуль
  it('pings the module observe counters around the shared device subscription', () => {
    const node = new Animated.Value(0, { useNativeDriver: true });
    node.__attach();
    const listenerId = node.addListener(() => {});
    expect(callsOf('addListener')).toHaveLength(1);

    node.removeListener(listenerId);
    expect(callsOf('removeListeners')).toHaveLength(1);
    node.__detach();
  });

  // RN's `AnimatedValue-test` "listeners added after re-attach": detach drops the old listeners
  it('streams to a listener added after a detach and re-attach, not to the old one', () => {
    const node = new Animated.Value(0, { useNativeDriver: true });
    node.__attach();
    const callbackA = vi.fn();
    node.addListener(callbackA);
    emitRnDeviceEvent('onAnimatedValueUpdate', {
      tag: node.__getNativeTag(),
      value: 123,
      offset: 50,
    });
    expect(callbackA).toHaveBeenCalledTimes(1);

    node.__detach();
    expect(callsOf('dropAnimatedNode')).toHaveLength(1);

    const callbackB = vi.fn();
    node.__attach();
    node.addListener(callbackB);
    emitRnDeviceEvent('onAnimatedValueUpdate', {
      tag: node.__getNativeTag(),
      value: 456,
      offset: 60,
    });
    expect(callbackA).toHaveBeenCalledTimes(1);
    expect(callbackB).toHaveBeenCalledTimes(1);
  });
});
