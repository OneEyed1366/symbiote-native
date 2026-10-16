// Кейсы из `AnimatedValue-test.js` RN и поведение `AnimatedValue.js` с нативным драйвером

import { beforeEach, describe, expect, it } from 'vitest';
import { AnimatedValue, timing } from '@symbiote-native/engine';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

type INativeCall = {
  method: string;
  args: unknown[];
};

const NATIVE_VALUE = 42;

let nativeCalls: INativeCall[];

function record(method: string): (...args: unknown[]) => void {
  return (...args: unknown[]) => {
    nativeCalls.push({ method, args });
  };
}

function callsOf(method: string): INativeCall[] {
  return nativeCalls.filter(call => call.method === method);
}

beforeEach(() => {
  nativeCalls = [];
  const fakeNativeAnimated = {
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
    getValue(tag: number, callback: (value: number) => void): void {
      nativeCalls.push({ method: 'getValue', args: [tag] });
      callback(NATIVE_VALUE);
    },
  };
  Object.assign(globalThis, {
    nativeModuleProxy: { NativeAnimatedTurboModule: fakeNativeAnimated },
  });
});

describe('AnimatedValue constructor config', () => {
  it('makes the value native with { useNativeDriver: true }', () => {
    const value = new AnimatedValue(0, { useNativeDriver: true });
    expect(value.__isNative()).toBe(true);
  });

  it('keeps the value JS-driven with { useNativeDriver: false } and without a config', () => {
    expect(new AnimatedValue(0, { useNativeDriver: false }).__isNative()).toBe(
      false,
    );
    expect(new AnimatedValue(0).__isNative()).toBe(false);
  });
});

describe('AnimatedValue.stopAnimation on a native value', () => {
  // RN отдаёт в callback живое значение из native, а не устаревшее JS-значение
  it('hands the callback the value native holds', () => {
    const value = new AnimatedValue(0, { useNativeDriver: true });
    let received: number | undefined;
    value.stopAnimation(v => {
      received = v;
    });
    expect(callsOf('getValue')).toHaveLength(1);
    expect(received).toBe(NATIVE_VALUE);
  });

  it('hands the callback the JS value when the value is not native', () => {
    const value = new AnimatedValue(7);
    let received: number | undefined;
    value.stopAnimation(v => {
      received = v;
    });
    expect(callsOf('getValue')).toHaveLength(0);
    expect(received).toBe(7);
  });
});

describe('AnimatedValue.__detach on a native value', () => {
  // RN перед отцеплением забирает значение из native, чтобы JS не откатился назад
  it('saves the value native holds', () => {
    const value = new AnimatedValue(0, { useNativeDriver: true });
    value.__attach();
    value.__detach();
    expect(callsOf('getValue')).toHaveLength(1);
    expect(value.__getValue()).toBe(NATIVE_VALUE);
  });

  it('drops the native node it created', () => {
    const value = new AnimatedValue(0, { useNativeDriver: true });
    value.__attach();
    value.addListener(() => {});
    value.__detach();
    expect(callsOf('dropAnimatedNode')).toHaveLength(1);
  });

  it('asks native nothing for a JS-driven value', () => {
    const value = new AnimatedValue(3);
    value.__attach();
    value.__detach();
    expect(callsOf('getValue')).toHaveLength(0);
    expect(value.__getValue()).toBe(3);
  });
});

// Порт `TimingAnimation-test.js`: таблица кадров, которую получает native
describe('timing animation native frames', () => {
  function framesFor(duration: number): number[] {
    timing(new AnimatedValue(0), {
      duration,
      toValue: 1,
      useNativeDriver: true,
    }).start();
    const config = callsOf('startAnimatingNode')[0].args[2];
    return isRecord(config) && Array.isArray(config.frames)
      ? config.frames
      : [];
  }

  it('returns 61 frames for one second ending at the target', () => {
    const frames = framesFor(1_000);
    expect(frames).toHaveLength(61);
    expect(frames[60]).toBe(1);
    expect(frames[59]).toBeLessThan(1);
  });

  it('copes with zero duration', () => {
    const frames = framesFor(0);
    expect(frames).toHaveLength(1);
    expect(frames[0]).toBe(1);
  });
});

describe('AnimatedValue.extractOffset', () => {
  it('moves the value into the offset and tells native when native', () => {
    const value = new AnimatedValue(5, { useNativeDriver: true });
    value.extractOffset();
    expect(callsOf('extractAnimatedNodeOffset')).toHaveLength(1);
    expect(value.__getValue()).toBe(5);
  });

  it('tells native nothing when not native', () => {
    const value = new AnimatedValue(5);
    value.extractOffset();
    expect(callsOf('extractAnimatedNodeOffset')).toHaveLength(0);
    expect(value.__getValue()).toBe(5);
  });
});
