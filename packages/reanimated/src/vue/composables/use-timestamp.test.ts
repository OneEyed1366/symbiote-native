import { installRecordingFabric } from '@symbiote-native/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderComposable } from '../../../test-support/render-composable';
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
  const composable = renderComposable(() => useTimestamp(isActive));
  mounted.push(composable.unmount);
  return composable;
}

describe('useTimestamp', () => {
  it('starts at zero', () => {
    const composable = rendered(false);

    expect(composable.result().value).toBe(0);
  });

  it('counts up the time since the first frame while it is active', async () => {
    const composable = rendered(true);

    await settle();

    expect(composable.result().value).toBeGreaterThan(0);
  });
});
