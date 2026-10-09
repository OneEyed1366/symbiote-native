import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { settle, workletOf } from '../../test-support/worklet';
import { createDerivedValue } from './derived-value';
import { createSharedValue } from './shared-value';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('a derived value made by the controller', () => {
  it('starts out as what the updater returns, run once', () => {
    const updater = vi.fn(() => 21 * 2);

    const { derived } = createDerivedValue(workletOf(updater, []));

    expect(derived.value).toBe(42);
    expect(updater).toHaveBeenCalledTimes(1);
  });

  it('follows the shared values the updater reads once started', async () => {
    const { shared } = createSharedValue(2);
    const updater = workletOf(() => shared.value * 10, [shared]);
    const controller = createDerivedValue(updater);
    controller.start(updater);
    await settle();

    shared.value = 5;
    await settle();

    expect(controller.derived.value).toBe(50);
  });

  it('stops following once it is stopped', async () => {
    const { shared } = createSharedValue(2);
    const updater = workletOf(() => shared.value * 10, [shared]);
    const controller = createDerivedValue(updater);
    controller.start(updater);
    await settle();
    controller.stop();
    await settle();

    shared.value = 5;
    await settle();

    expect(controller.derived.value).toBe(20);
  });

  it('follows a new updater and forgets the old one', async () => {
    const { shared } = createSharedValue(2);
    const first = workletOf(() => shared.value * 10, [shared], 1);
    const second = workletOf(() => shared.value + 1, [shared], 2);
    const controller = createDerivedValue(first);
    controller.start(first);
    await settle();

    controller.start(second);
    await settle();
    shared.value = 7;
    await settle();

    expect(controller.derived.value).toBe(8);
  });

  it('lists the shared values and the hash as what a restart depends on', () => {
    const { shared } = createSharedValue(1);
    const updater = workletOf(() => shared.value, [shared], 9);
    const { dependenciesOf } = createDerivedValue(updater);

    expect(dependenciesOf(updater)).toEqual([shared, 9]);
  });
});
