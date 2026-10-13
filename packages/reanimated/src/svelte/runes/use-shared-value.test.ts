import { installRecordingFabric } from '@symbiote-native/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { cancelAnimation } from 'react-native-reanimated/src/animation';
import { renderComposable } from '../../../test-support/render-svelte-composable.svelte';
import { hooks } from './hooks';

const { useSharedValue } = hooks;

installRecordingFabric();

vi.mock('react-native-reanimated/src/animation', async importOriginal => ({
  ...(await importOriginal<
    typeof import('react-native-reanimated/src/animation')
  >()),
  cancelAnimation: vi.fn(),
}));

describe('useSharedValue', () => {
  it('holds the initial value', () => {
    const composable = renderComposable(() => useSharedValue(5));

    expect(composable.result().value).toBe(5);
  });

  it('calls a function initial value once, and holds what it returned', () => {
    const initial = vi.fn(() => 'made');

    const composable = renderComposable(() => useSharedValue(initial));

    expect(initial).toHaveBeenCalledTimes(1);
    expect(composable.result().value).toBe('made');
  });

  it('cancels the animation it may be running once the component is gone', () => {
    const composable = renderComposable(() => useSharedValue(1));
    const shared = composable.result();

    composable.unmount();

    expect(cancelAnimation).toHaveBeenCalledWith(shared);
  });
});
