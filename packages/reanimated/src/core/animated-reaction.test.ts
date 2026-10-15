import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { settle, workletOf } from '../../test-support/worklet';
import { createAnimatedReaction } from './animated-reaction';
import { createSharedValue } from './shared-value';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function twiceOf(shared: { value: number }, hash = 1) {
  return workletOf(() => shared.value * 2, [shared], hash);
}

describe('an animated reaction made by the controller', () => {
  it('reacts once when it starts, with nothing before it', async () => {
    const { shared } = createSharedValue(1);
    const react = vi.fn();
    const controller = createAnimatedReaction();

    controller.start(twiceOf(shared), workletOf(react, []));
    await settle();

    expect(react).toHaveBeenCalledTimes(1);
    expect(react).toHaveBeenLastCalledWith(2, null);
  });

  it('hands the reaction the prepared value and the one before it', async () => {
    const { shared } = createSharedValue(1);
    const react = vi.fn();
    const controller = createAnimatedReaction();
    controller.start(twiceOf(shared), workletOf(react, []));
    await settle();

    shared.value = 5;
    await settle();

    expect(react).toHaveBeenLastCalledWith(10, 2);
  });

  it('stops reacting once it is stopped', async () => {
    const { shared } = createSharedValue(1);
    const react = vi.fn();
    const controller = createAnimatedReaction();
    controller.start(twiceOf(shared), workletOf(react, []));
    await settle();
    controller.stop();
    await settle();
    react.mockClear();

    shared.value = 9;
    await settle();

    expect(react).not.toHaveBeenCalled();
  });

  it('keeps the previous value across a restart with new functions', async () => {
    const { shared } = createSharedValue(1);
    const first = vi.fn();
    const second = vi.fn();
    const controller = createAnimatedReaction();
    controller.start(twiceOf(shared, 1), workletOf(first, [], 10));
    await settle();

    controller.start(twiceOf(shared, 2), workletOf(second, [], 11));
    await settle();
    first.mockClear();
    shared.value = 4;
    await settle();

    expect(second).toHaveBeenLastCalledWith(8, 2);
    expect(first).not.toHaveBeenCalled();
  });

  it('lists the closures and hashes of both functions as what a restart depends on', () => {
    const { shared } = createSharedValue(1);
    const prepare = twiceOf(shared, 7);
    const react = workletOf(() => undefined, [], 8);

    expect(createAnimatedReaction().dependenciesOf(prepare, react)).toEqual([
      shared,
      7,
      8,
    ]);
  });
});
