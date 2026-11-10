import { installRecordingFabric } from '@symbiote-native/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '../../../test-support/render-hook';
import { settle } from '../../../test-support/worklet';
import { useTimestamp } from './use-timestamp';

installRecordingFabric();

const mounted: Array<() => void> = [];

beforeEach(() => vi.useFakeTimers());
// The UI registry is shared, so a loop left running would outlive the fake clock of its test
afterEach(async () => {
  for (const unmount of mounted.splice(0)) unmount();
  await settle();
  vi.useRealTimers();
});

function rendered(isActive: boolean) {
  const hook = renderHook((active: boolean) => useTimestamp(active), isActive);
  mounted.push(hook.unmount);
  return hook;
}

describe('useTimestamp', () => {
  it('starts at zero', () => {
    const hook = rendered(false);

    expect(hook.latest().value).toBe(0);
  });

  it('counts up the time since the first frame while it is active', async () => {
    const hook = rendered(true);

    await settle();

    expect(hook.latest().value).toBeGreaterThan(0);
  });

  it('stands still once it is made inactive', async () => {
    const hook = rendered(true);
    await settle();

    hook.rerender(false);
    await settle();
    const stopped = hook.latest().value;
    await settle();

    expect(hook.latest().value).toBe(stopped);
  });

  it('is the same shared value on every render', () => {
    const hook = rendered(true);
    const first = hook.latest();

    hook.rerender(true);

    expect(hook.latest()).toBe(first);
  });
});
