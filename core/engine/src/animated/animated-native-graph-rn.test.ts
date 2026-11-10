// Порт 'Animated Graph', 'Animations' и 'Animated Value' из `AnimatedNative-test.js` RN:
// какие вызовы и описания узлов уходят в native-модуль

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AnimatedProps,
  AnimatedValue,
  AnimatedValueXY,
  add,
  decay,
  diffClamp,
  divide,
  event,
  loop,
  modulo,
  multiply,
  spring,
  subtract,
  timing,
} from '@symbiote-native/engine';
import {
  allowInterpolationParam,
  isSupportedInterpolationParam,
  isSupportedStyleProp,
  isSupportedTransformProp,
} from './native/allowlist';

type INativeCall = { method: string; args: unknown[] };

let calls: INativeCall[];

function record(method: string): (...args: unknown[]) => void {
  return (...args: unknown[]) => {
    calls.push({ method, args });
  };
}

function callsOf(method: string): INativeCall[] {
  return calls.filter(call => call.method === method);
}

function createdOfType(type: string): INativeCall[] {
  return callsOf('createAnimatedNode').filter(
    call => isTyped(call.args[1]) && call.args[1].type === type,
  );
}

function isTyped(value: unknown): value is { type: string } {
  return typeof value === 'object' && value !== null && 'type' in value;
}

function configOf(call: INativeCall): Record<string, unknown> {
  const config = call.args[1];
  return typeof config === 'object' && config !== null
    ? Object.fromEntries(Object.entries(config))
    : {};
}

function indexOfCall(
  method: string,
  match: (args: unknown[]) => boolean,
): number {
  return calls.findIndex(call => call.method === method && match(call.args));
}

let saveValue = 1;

beforeEach(() => {
  calls = [];
  saveValue = 1;
  Object.assign(globalThis, {
    nativeModuleProxy: {
      NativeAnimatedTurboModule: {
        createAnimatedNode: record('createAnimatedNode'),
        connectAnimatedNodes: record('connectAnimatedNodes'),
        disconnectAnimatedNodes: record('disconnectAnimatedNodes'),
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
        stopListeningToAnimatedNodeValue: record(
          'stopListeningToAnimatedNodeValue',
        ),
        restoreDefaultValues: record('restoreDefaultValues'),
        addAnimatedEventToView: record('addAnimatedEventToView'),
        removeAnimatedEventFromView: record('removeAnimatedEventFromView'),
        getValue(tag: number, callback: (value: number) => void): void {
          calls.push({ method: 'getValue', args: [tag] });
          callback(saveValue);
        },
      },
    },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('NativeAnimatedAllowlist', () => {
  it('rejects invalid style props', () => {
    for (const value of ['', 'left', 'unknownStyle']) {
      expect(isSupportedStyleProp(value)).toBe(false);
    }
  });

  it('knows the supported interpolation params', () => {
    for (const param of [
      'inputRange',
      'outputRange',
      'extrapolate',
      'extrapolateRight',
      'extrapolateLeft',
    ]) {
      expect(isSupportedInterpolationParam(param)).toBe(true);
    }
  });

  it('allows a new interpolation param', () => {
    expect(isSupportedInterpolationParam('other')).toBe(false);
    allowInterpolationParam('other');
    expect(isSupportedInterpolationParam('other')).toBe(true);
  });

  it('knows the supported transform props', () => {
    expect(isSupportedTransformProp('translateX')).toBe(true);
    expect(isSupportedTransformProp('translateY')).toBe(true);
    expect(isSupportedTransformProp('matrix')).toBe(false);
  });
});

describe('Native Animated Value', () => {
  it('proxies setValue to native', () => {
    const opacity = new AnimatedValue(0);
    timing(opacity, {
      toValue: 10,
      duration: 1_000,
      useNativeDriver: true,
    }).start();
    opacity.setValue(0.5);
    expect(callsOf('setAnimatedNodeValue').map(call => call.args[1])).toEqual([
      0.5,
    ]);
  });

  it('sets, flattens and extracts the offset in native', () => {
    const opacity = new AnimatedValue(0);
    opacity.setOffset(10);
    opacity.__makeNative();
    const props = new AnimatedProps({ style: { opacity } });
    props.__attach();
    expect(createdOfType('value').map(configOf)).toContainEqual({
      type: 'value',
      value: 0,
      offset: 10,
    });
    opacity.setOffset(20);
    expect(callsOf('setAnimatedNodeOffset').map(call => call.args[1])).toEqual([
      20,
    ]);
    opacity.flattenOffset();
    expect(callsOf('flattenAnimatedNodeOffset')).toHaveLength(1);
    opacity.extractOffset();
    expect(callsOf('extractAnimatedNodeOffset')).toHaveLength(1);
  });

  it('deducts the offset when saving the value on detach', () => {
    const opacity = new AnimatedValue(0);
    opacity.setOffset(0.5);
    opacity.__makeNative();
    const props = new AnimatedProps({ style: { opacity } });
    props.__attach();
    props.__detach();
    expect(callsOf('getValue')).toHaveLength(1);
    expect(opacity.__getValue()).toBe(1);
  });
});

describe('Native Animated Graph', () => {
  function attachWith(style: Record<string, unknown>): AnimatedProps {
    const props = new AnimatedProps({ style });
    props.__attach();
    return props;
  }

  it('sends a valid description for value, style and props nodes', () => {
    const opacity = new AnimatedValue(0);
    attachWith({ opacity });
    timing(opacity, {
      toValue: 10,
      duration: 1_000,
      useNativeDriver: true,
    }).start();
    expect(createdOfType('value').map(configOf)).toContainEqual({
      type: 'value',
      value: 0,
      offset: 0,
    });
    expect(createdOfType('style').map(configOf)).toContainEqual({
      type: 'style',
      style: { opacity: expect.any(Number) },
    });
    expect(createdOfType('props').map(configOf)).toContainEqual({
      type: 'props',
      props: { style: expect.any(Number) },
    });
  });

  it('creates and then detaches nodes', () => {
    const opacity = new AnimatedValue(0);
    const props = attachWith({ opacity });
    timing(opacity, {
      toValue: 10,
      duration: 1_000,
      useNativeDriver: true,
    }).start();
    expect(callsOf('createAnimatedNode')).toHaveLength(3);
    expect(callsOf('connectAnimatedNodes')).toHaveLength(2);
    expect(callsOf('disconnectAnimatedNodes')).toHaveLength(0);
    expect(callsOf('dropAnimatedNode')).toHaveLength(0);
    props.__detach();
    expect(callsOf('disconnectAnimatedNodes')).toHaveLength(2);
    expect(callsOf('dropAnimatedNode')).toHaveLength(3);
  });

  it.each([
    ['addition', add, 1, 2],
    ['subtraction', subtract, 2, 1],
    ['multiplication', multiply, 2, 1],
    ['division', divide, 4, 2],
  ])('sends a valid description for the %s node', (type, operator, a, b) => {
    const first = new AnimatedValue(a);
    const second = new AnimatedValue(b);
    first.__makeNative();
    second.__makeNative();
    attachWith({ opacity: operator(first, second) });
    const nodeCalls = createdOfType(type);
    expect(nodeCalls).toHaveLength(1);
    const [nodeCall] = nodeCalls;
    const nodeTag = nodeCall.args[0];
    expect(
      callsOf('connectAnimatedNodes').filter(c => c.args[1] === nodeTag),
    ).toHaveLength(2);
    const input = configOf(nodeCall).input;
    expect(input).toEqual([expect.any(Number), expect.any(Number)]);
    expect(createdOfType('value').map(configOf)).toEqual(
      expect.arrayContaining([
        { type: 'value', value: a, offset: 0 },
        { type: 'value', value: b, offset: 0 },
      ]),
    );
  });

  it('sends a valid description for the modulus node', () => {
    const value = new AnimatedValue(4);
    value.__makeNative();
    attachWith({ opacity: modulo(value, 4) });
    expect(createdOfType('modulus').map(configOf)).toEqual([
      { type: 'modulus', modulus: 4, input: expect.any(Number) },
    ]);
  });

  it('sends a valid description for the diffclamp node', () => {
    const value = new AnimatedValue(2);
    value.__makeNative();
    attachWith({ opacity: diffClamp(value, 0, 20) });
    expect(createdOfType('diffclamp').map(configOf)).toEqual([
      { type: 'diffclamp', input: expect.any(Number), max: 20, min: 0 },
    ]);
  });

  it('sends a valid description for the interpolation node', () => {
    const value = new AnimatedValue(10);
    value.__makeNative();
    attachWith({
      opacity: value.interpolate({ inputRange: [10, 20], outputRange: [0, 1] }),
    });
    expect(createdOfType('interpolation').map(configOf)).toEqual([
      {
        type: 'interpolation',
        inputRange: [10, 20],
        outputRange: [0, 1],
        outputType: null,
        extrapolateLeft: 'extend',
        extrapolateRight: 'extend',
      },
    ]);
    const interpolationTag = createdOfType('interpolation')[0].args[0];
    const valueTag = createdOfType('value')[0].args[0];
    expect(
      indexOfCall(
        'connectAnimatedNodes',
        args => args[0] === valueTag && args[1] === interpolationTag,
      ),
    ).toBeGreaterThanOrEqual(0);
  });

  it('sends a valid description for the transform node', () => {
    const translateX = new AnimatedValue(0);
    translateX.__makeNative();
    attachWith({ transform: [{ translateX }, { scale: 2 }] });
    expect(createdOfType('transform').map(configOf)).toEqual([
      {
        type: 'transform',
        transforms: [
          {
            nodeTag: expect.any(Number),
            property: 'translateX',
            type: 'animated',
          },
          { value: 2, property: 'scale', type: 'static' },
        ],
      },
    ]);
  });

  it('creates every node before it connects it, for several animated props', () => {
    const opacity = new AnimatedValue(0);
    const borderRadius = new AnimatedValue(0);
    attachWith({ borderRadius, opacity });
    timing(opacity, {
      toValue: 10,
      duration: 1_000,
      useNativeDriver: true,
    }).start();

    const created = new Set<unknown>();
    for (const call of calls) {
      if (call.method === 'createAnimatedNode') created.add(call.args[0]);
      if (call.method === 'connectAnimatedNodes') {
        expect(created.has(call.args[0])).toBe(true);
        expect(created.has(call.args[1])).toBe(true);
      }
    }
  });

  it('creates every node before it connects it, for several animated transforms', () => {
    const translateX = new AnimatedValue(0);
    const translateY = new AnimatedValue(0);
    attachWith({ transform: [{ translateX }, { translateY }] });
    timing(translateX, {
      toValue: 10,
      duration: 1_000,
      useNativeDriver: true,
    }).start();

    const created = new Set<unknown>();
    for (const call of calls) {
      if (call.method === 'createAnimatedNode') created.add(call.args[0]);
      if (call.method === 'connectAnimatedNodes') {
        expect(created.has(call.args[0])).toBe(true);
        expect(created.has(call.args[1])).toBe(true);
      }
    }
  });

  it('does not call native when the driver is JS', () => {
    Object.assign(globalThis, {
      requestAnimationFrame: (): number => 0,
      cancelAnimationFrame: (): void => {},
    });
    const opacity = new AnimatedValue(0);
    const props = attachWith({ opacity });
    timing(opacity, {
      toValue: 10,
      duration: 1_000,
      useNativeDriver: false,
    }).start();
    props.__detach();
    expect(callsOf('createAnimatedNode')).toHaveLength(0);
  });

  it('fails when a JS animation runs on a native node', () => {
    const opacity = new AnimatedValue(0);
    attachWith({ opacity });
    timing(opacity, {
      toValue: 10,
      duration: 50,
      useNativeDriver: true,
    }).start();
    expect(() => {
      timing(opacity, {
        toValue: 4,
        duration: 500,
        useNativeDriver: false,
      }).start();
    }).toThrow(
      'Attempting to run JS driven animation on animated node that has ' +
        'been moved to "native" earlier by starting an animation with ' +
        '`useNativeDriver: true`',
    );
  });

  it('logs unsupported styles in a dev build', () => {
    Object.assign(globalThis, { __DEV__: true });
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const left = new AnimatedValue(0);
    attachWith({ left });
    timing(left, { toValue: 10, duration: 50, useNativeDriver: true }).start();
    expect(error).toHaveBeenCalledWith(
      "Style property 'left' is not supported by native animated module",
    );
    Reflect.deleteProperty(globalThis, '__DEV__');
  });

  it('works for static props and styles next to an animated one', () => {
    const opacity = new AnimatedValue(0);
    opacity.__makeNative();
    const props = new AnimatedProps({
      removeClippedSubviews: true,
      style: { left: 10, opacity, top: 20 },
    });
    props.__attach();
    expect(createdOfType('style').map(configOf)).toContainEqual({
      type: 'style',
      style: { opacity: expect.any(Number) },
    });
    expect(createdOfType('props').map(configOf)).toContainEqual({
      type: 'props',
      props: { style: expect.any(Number) },
    });
  });
});

describe('Native Animated Events', () => {
  const VIEW_TAG = 7;

  it('maps events to a native path and detaches them', () => {
    const value = new AnimatedValue(0);
    value.__makeNative();
    const handler = event([{ nativeEvent: { state: { foo: value } } }], {
      useNativeDriver: true,
    });
    handler.__getEvent().__attach(VIEW_TAG, 'onTouchMove');
    expect(callsOf('addAnimatedEventToView').map(call => call.args)).toEqual([
      [
        VIEW_TAG,
        'onTouchMove',
        {
          nativeEventPath: ['state', 'foo'],
          animatedValueTag: value.__getNativeTag(),
        },
      ],
    ]);
    expect(callsOf('removeAnimatedEventFromView')).toHaveLength(0);
    handler.__getEvent().__detach(VIEW_TAG, 'onTouchMove');
    expect(
      callsOf('removeAnimatedEventFromView').map(call => call.args),
    ).toEqual([[VIEW_TAG, 'onTouchMove', value.__getNativeTag()]]);
  });

  it('maps an AnimatedValueXY into x and y paths', () => {
    const value = new AnimatedValueXY({ x: 0, y: 0 });
    value.x.__makeNative();
    value.y.__makeNative();
    const handler = event([{ nativeEvent: { state: value } }], {
      useNativeDriver: true,
    });
    handler.__getEvent().__attach(VIEW_TAG, 'onTouchMove');
    expect(callsOf('addAnimatedEventToView').map(call => call.args[2])).toEqual(
      [
        {
          nativeEventPath: ['state', 'x'],
          animatedValueTag: value.x.__getNativeTag(),
        },
        {
          nativeEventPath: ['state', 'y'],
          animatedValueTag: value.y.__getNativeTag(),
        },
      ],
    );
  });

  it('throws on a path outside nativeEvent', () => {
    const value = new AnimatedValue(0);
    value.__makeNative();
    const handler = event([{ notNativeEvent: { foo: value } }], {
      useNativeDriver: true,
    });
    expect(() => {
      handler.__getEvent().__attach(VIEW_TAG, 'onTouchMove');
    }).toThrow(/nativeEvent/);
    expect(callsOf('addAnimatedEventToView')).toHaveLength(0);
  });

  it('calls listeners of a native event', () => {
    const value = new AnimatedValue(0);
    value.__makeNative();
    const listener = vi.fn();
    const handler = event([{ nativeEvent: { foo: value } }], {
      useNativeDriver: true,
      listener,
    });
    handler({ nativeEvent: { foo: 42 } });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({ nativeEvent: { foo: 42 } });
  });

  it('warns without options and without the native driver flag', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    event([{ nativeEvent: {} }]);
    expect(warn).toHaveBeenCalledWith(
      'Animated.event now requires a second argument for options',
    );
    warn.mockClear();
    event([{ nativeEvent: {} }], {});
    expect(warn).toHaveBeenCalledWith(
      'Animated: `useNativeDriver` was not specified. This is a required option and must be explicitly set to `true` or `false`',
    );
  });
});

describe('Animated.event mapping validation in a dev build', () => {
  beforeEach(() => {
    Object.assign(globalThis, { __DEV__: true });
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, '__DEV__');
  });

  it('throws when the event has fewer arguments than the mapping', () => {
    const handler = event(
      [{ foo: new AnimatedValue(0) }, { bar: new AnimatedValue(0) }],
      {
        useNativeDriver: false,
      },
    );
    expect(() => handler({ foo: 1 })).toThrow(
      'Event has less arguments than mapping',
    );
  });

  it('throws when a value maps to a non-number', () => {
    const handler = event([{ foo: new AnimatedValue(0) }], {
      useNativeDriver: false,
    });
    expect(() => handler({ foo: 'x' })).toThrow(
      'Bad mapping of event key foo, should be number but got string',
    );
  });

  it('throws when a number maps to something that is not a value', () => {
    const handler = event([{ foo: {} }], { useNativeDriver: false });
    expect(() => handler({ foo: 1 })).toThrow(
      'Bad mapping of type object for key foo, event value must map to AnimatedValue',
    );
  });

  it('validates only the first event', () => {
    const value = new AnimatedValue(0);
    const handler = event([{ foo: value }], { useNativeDriver: false });
    handler({ foo: 1 });
    expect(() => handler({ foo: 'x' })).not.toThrow();
  });
});

describe('Native Animations', () => {
  function startedConfig(index = 0): unknown {
    return callsOf('startAnimatingNode')[index].args[2];
  }

  it('sends a valid timing description', () => {
    timing(new AnimatedValue(0), {
      toValue: 10,
      duration: 1_000,
      useNativeDriver: true,
    }).start();
    expect(startedConfig()).toEqual({
      type: 'frames',
      frames: expect.any(Array),
      toValue: 10,
      iterations: 1,
    });
  });

  it('sends valid spring descriptions for all three parameterizations', () => {
    const anim = new AnimatedValue(0);
    const base = {
      type: 'spring',
      initialVelocity: 0,
      overshootClamping: false,
      restDisplacementThreshold: 0.001,
      restSpeedThreshold: 0.001,
      toValue: 10,
      iterations: 1,
    };
    spring(anim, {
      toValue: 10,
      friction: 5,
      tension: 164,
      useNativeDriver: true,
    }).start();
    expect(startedConfig(0)).toEqual({
      ...base,
      stiffness: 679.08,
      damping: 16,
      mass: 1,
    });
    spring(anim, {
      toValue: 10,
      stiffness: 1_000,
      damping: 500,
      mass: 3,
      useNativeDriver: true,
    }).start();
    expect(startedConfig(1)).toEqual({
      ...base,
      stiffness: 1_000,
      damping: 500,
      mass: 3,
    });
    spring(anim, {
      toValue: 10,
      bounciness: 8,
      speed: 10,
      useNativeDriver: true,
    }).start();
    expect(startedConfig(2)).toEqual({
      ...base,
      damping: 23.05223140901191,
      stiffness: 299.61882352941177,
      mass: 1,
    });
  });

  it('sends a valid decay description', () => {
    decay(new AnimatedValue(0), {
      velocity: 10,
      deceleration: 0.1,
      useNativeDriver: true,
    }).start();
    expect(startedConfig()).toEqual({
      type: 'decay',
      deceleration: 0.1,
      velocity: 10,
      iterations: 1,
    });
  });

  it('works with loop', () => {
    loop(
      decay(new AnimatedValue(0), {
        velocity: 10,
        deceleration: 0.1,
        useNativeDriver: true,
      }),
      { iterations: 10 },
    ).start();
    expect(startedConfig()).toEqual({
      type: 'decay',
      deceleration: 0.1,
      velocity: 10,
      iterations: 10,
    });
  });

  it('sends stopAnimation to native', () => {
    const animation = timing(new AnimatedValue(0), {
      toValue: 10,
      duration: 50,
      useNativeDriver: true,
    });
    animation.start();
    const animationId = callsOf('startAnimatingNode')[0].args[0];
    animation.stop();
    expect(callsOf('stopAnimation').map(call => call.args[0])).toEqual([
      animationId,
    ]);
  });

  it('hands the stopAnimation callback the native value', () => {
    const anim = new AnimatedValue(0);
    timing(anim, {
      duration: 1_000,
      toValue: 1,
      useNativeDriver: true,
    }).start();
    let current = 0;
    anim.stopAnimation(value => {
      current = value;
    });
    expect(callsOf('getValue')).toHaveLength(1);
    expect(current).toBe(1);
  });
});
