// RN #49719: `addListener` на производном узле срабатывает, пока узел подключён к входам, как в RN 0.86

import { describe, expect, it, vi } from 'vitest';
import { add, multiply, AnimatedValue } from '@symbiote-native/engine';

describe('Animated derived-node listeners (JS driver)', () => {
  it('add(a, b) listener fires with the sum when a changes', () => {
    const a = new AnimatedValue(1);
    const b = new AnimatedValue(2);
    const sum = add(a, b);
    const listener = vi.fn();
    sum.__attach();
    sum.addListener(listener);

    a.setValue(5);

    expect(listener).toHaveBeenCalledWith({ value: 7 });
  });

  it('multiply(add(a, b), c) listener fires through two derived levels', () => {
    const a = new AnimatedValue(1);
    const b = new AnimatedValue(2);
    const c = new AnimatedValue(3);
    const product = multiply(add(a, b), c);
    const listener = vi.fn();
    product.__attach();
    product.addListener(listener);

    b.setValue(4);

    expect(listener).toHaveBeenCalledWith({ value: 15 });
  });

  it('a node nobody attached stays silent, same as RN (`addListener` does not attach)', () => {
    const a = new AnimatedValue(1);
    const sum = add(a, new AnimatedValue(2));
    const listener = vi.fn();
    sum.addListener(listener);

    a.setValue(5);

    expect(listener).not.toHaveBeenCalled();
  });
});
