// Порт кейсов Events, Listeners и Diff Clamp из `Animated-test.js` RN

import { describe, expect, it, vi } from 'vitest';
import {
  AnimatedProps,
  AnimatedValue,
  AnimatedValueXY,
  add,
  diffClamp,
  event,
  forkEvent,
  multiply,
} from '@symbiote-native/engine';

describe('Animated Events', () => {
  it('maps events', () => {
    const value = new AnimatedValue(0);
    const handler = event([null, { state: { foo: value } }], {
      useNativeDriver: false,
    });
    handler({ bar: 'ignoreBar' }, { state: { baz: 'ignoreBaz', foo: 42 } });
    expect(value.__getValue()).toBe(42);
  });

  it('validates AnimatedValueXY mappings', () => {
    const value = new AnimatedValueXY({ x: 0, y: 0 });
    const handler = event([{ state: value }], { useNativeDriver: false });
    handler({ state: { x: 1, y: 2 } });
    expect(value.__getValue()).toMatchObject({ x: 1, y: 2 });
  });

  it('calls listeners', () => {
    const value = new AnimatedValue(0);
    const listener = vi.fn();
    const handler = event([{ foo: value }], {
      listener,
      useNativeDriver: false,
    });
    handler({ foo: 42 });
    expect(value.__getValue()).toBe(42);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({ foo: 42 });
  });

  it('calls forked event listeners, with event() listener', () => {
    const value = new AnimatedValue(0);
    const listener = vi.fn();
    const handler = event([{ foo: value }], {
      listener,
      useNativeDriver: false,
    });
    const listener2 = vi.fn();
    forkEvent(handler, listener2)({ foo: 42 });
    expect(value.__getValue()).toBe(42);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({ foo: 42 });
    expect(listener2).toHaveBeenCalledTimes(1);
    expect(listener2).toHaveBeenCalledWith({ foo: 42 });
  });

  it('calls forked event listeners, with js listener', () => {
    const listener = vi.fn();
    const listener2 = vi.fn();
    forkEvent(listener, listener2)({ foo: 42 });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({ foo: 42 });
    expect(listener2).toHaveBeenCalledTimes(1);
    expect(listener2).toHaveBeenCalledWith({ foo: 42 });
  });

  it('calls forked event listeners, with undefined listener', () => {
    const listener2 = vi.fn();
    forkEvent(undefined, listener2)({ foo: 42 });
    expect(listener2).toHaveBeenCalledTimes(1);
    expect(listener2).toHaveBeenCalledWith({ foo: 42 });
  });
});

describe('Animated Listeners', () => {
  it('gets updates', () => {
    const value = new AnimatedValue(0);
    const listener = vi.fn();
    const id = value.addListener(listener);
    value.setValue(42);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({ value: 42 });
    expect(value.__getValue()).toBe(42);
    value.setValue(7);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenCalledWith({ value: 7 });
    value.removeListener(id);
    value.setValue(1_492);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(value.__getValue()).toBe(1_492);
  });

  it('gets updates for derived animated nodes', () => {
    const value1 = new AnimatedValue(40);
    const value2 = new AnimatedValue(50);
    const value3 = new AnimatedValue(0);
    const value4 = add(value3, multiply(value1, value2));
    const view = new AnimatedProps({
      style: { transform: [{ translateX: value4 }] },
    });
    view.__attach();
    const listener = vi.fn();
    const id = value4.addListener(listener);

    value3.setValue(137);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({ value: 2_137 });

    value1.setValue(0);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenCalledWith({ value: 137 });
    expect(view.__getValue()).toEqual({
      style: { transform: [{ translateX: 137 }] },
    });

    value4.removeListener(id);
    value1.setValue(40);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(value4.__getValue()).toBe(2_137);
  });

  it('removes all listeners', () => {
    const value = new AnimatedValue(0);
    const listener = vi.fn();
    for (let i = 0; i < 4; i++) value.addListener(listener);
    value.setValue(42);
    expect(listener).toHaveBeenCalledTimes(4);
    expect(listener).toHaveBeenCalledWith({ value: 42 });
    value.removeAllListeners();
    value.setValue(7);
    expect(listener).toHaveBeenCalledTimes(4);
  });
});

describe('Animated Diff Clamp', () => {
  it('gets the proper value', () => {
    const inputValues = [0, 20, 40, 30, 0, -40, -10, -20, 0];
    const expectedValues = [0, 20, 20, 10, 0, 0, 20, 10, 20];
    const value = new AnimatedValue(0);
    const diffClampValue = diffClamp(value, 0, 20);
    for (let i = 0; i < inputValues.length; i++) {
      value.setValue(inputValues[i]);
      expect(diffClampValue.__getValue()).toBe(expectedValues[i]);
    }
  });
});
