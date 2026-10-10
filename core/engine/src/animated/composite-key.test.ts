// Порт `createAnimatedPropsMemoHook-test` без allowlist

import { describe, expect, it } from 'vitest';
import { AnimatedEvent, AnimatedValue } from '@symbiote-native/engine';
import {
  areCompositeKeysEqual,
  createCompositeKeyForProps,
} from './composite-key';

function nativeEvent(): AnimatedEvent {
  return new AnimatedEvent([], { useNativeDriver: true });
}

describe('createCompositeKeyForProps', () => {
  it('excludes non-array and non-object props', () => {
    const props = { string: 'abc', number: 123, boolean: true, function() {} };
    expect(createCompositeKeyForProps(props)).toBe(null);
  });

  it('includes array props without searching them', () => {
    const props = { array: [{ letter: 'a' }, { letter: 'b' }] };
    const key = createCompositeKeyForProps(props);
    expect(key).toEqual({ array: props.array });
    expect(key?.array).toBe(props.array);
  });

  it('includes object props without searching them', () => {
    const props = { object: { foo: [1], bar: [2] } };
    const key = createCompositeKeyForProps(props);
    expect(key?.object).toBe(props.object);
  });

  it('includes `AnimatedEvent` props at first depth', () => {
    const props = { foo: nativeEvent(), object: { bar: nativeEvent() } };
    const key = createCompositeKeyForProps(props);
    expect(key?.foo).toBe(props.foo);
    expect(key?.object).toBe(props.object);
  });

  it('excludes `AnimatedEvent` props in the `style` prop', () => {
    const props = { style: { baz: nativeEvent() } };
    expect(createCompositeKeyForProps(props)).toBe(null);
  });

  it('includes `AnimatedNode` props', () => {
    const foo = new AnimatedValue(1);
    const bar = new AnimatedValue(1);
    const key = createCompositeKeyForProps({ foo, bar });
    expect(key?.foo).toBe(foo);
    expect(key?.bar).toBe(bar);
  });

  it('searches the `style` prop for `AnimatedNode` instances', () => {
    const opacity = new AnimatedValue(1);
    const rotateY = new AnimatedValue(1);
    const transform = [{ rotateX: 1 }, { rotateY }, { rotateZ: 1 }];
    const key = createCompositeKeyForProps({ style: { opacity, transform } });
    expect(key).toEqual({
      style: { opacity, transform: [null, { rotateY }, null] },
    });
  });

  it('flattens the `style` prop before searching it', () => {
    const opacityA = new AnimatedValue(1);
    const opacityB = new AnimatedValue(1);
    const key = createCompositeKeyForProps({
      style: [{ opacity: opacityA }, { opacity: opacityB }],
    });
    expect(key).toEqual({ style: { opacity: opacityB } });
  });
});

describe('areCompositeKeysEqual', () => {
  it('compares identical keys without traversal', () => {
    let reads = 0;
    const key = {
      object: {
        get property() {
          reads += 1;
          return {};
        },
      },
    };
    expect(areCompositeKeysEqual(key, key)).toBe(true);
    expect(reads).toBe(0);
  });

  it('compares null keys', () => {
    const key = { foo: new AnimatedValue(1) };
    expect(areCompositeKeysEqual(null, null)).toBe(true);
    expect(areCompositeKeysEqual(key, null)).toBe(false);
    expect(areCompositeKeysEqual(null, key)).toBe(false);
  });

  it('compares keys with different lengths', () => {
    const a = { foo: new AnimatedValue(1) };
    const b = { foo: new AnimatedValue(1), bar: new AnimatedValue(1) };
    expect(areCompositeKeysEqual(a, b)).toBe(false);
    expect(areCompositeKeysEqual(b, a)).toBe(false);
  });

  it('compares keys with `AnimatedNode` and `AnimatedEvent` instances', () => {
    const foo = new AnimatedValue(1);
    const bar = new AnimatedValue(1);
    expect(areCompositeKeysEqual({ foo, bar }, { foo, bar })).toBe(true);
    expect(areCompositeKeysEqual({ foo }, { foo: bar })).toBe(false);
    const first = nativeEvent();
    const second = nativeEvent();
    expect(areCompositeKeysEqual({ first, second }, { first, second })).toBe(
      true,
    );
    expect(areCompositeKeysEqual({ first }, { first: second })).toBe(false);
  });

  it('compares keys with `style` props and identical `AnimatedNode`', () => {
    const opacity = new AnimatedValue(1);
    const rotateY = new AnimatedValue(1);
    const a = { style: { opacity, transform: [null, { rotateY }, null] } };
    const b = { style: { opacity, transform: [null, { rotateY }, null] } };
    expect(areCompositeKeysEqual(a, b)).toBe(true);
    expect(areCompositeKeysEqual(b, a)).toBe(true);
  });

  it('compares keys with `style` props and different `AnimatedNode`', () => {
    const opacity = new AnimatedValue(1);
    const withNewRotate = () => ({
      style: {
        opacity,
        transform: [null, { rotateY: new AnimatedValue(1) }, null],
      },
    });
    const a = withNewRotate();
    const b = withNewRotate();
    expect(areCompositeKeysEqual(a, b)).toBe(false);
    expect(areCompositeKeysEqual(b, a)).toBe(false);
  });

  it('compares arrays and objects by identity', () => {
    const bar = new AnimatedValue(1);
    expect(areCompositeKeysEqual({ foo: [bar] }, { foo: [bar] })).toBe(false);
    expect(areCompositeKeysEqual({ foo: { bar } }, { foo: { bar } })).toBe(
      false,
    );
  });

  it('compares style arrays with the same `AnimatedNode` at different indices', () => {
    const bar = new AnimatedValue(1);
    const a = { style: { transform: [bar, null] } };
    const b = { style: { transform: [null, bar] } };
    expect(areCompositeKeysEqual(a, b)).toBe(false);
  });
});
