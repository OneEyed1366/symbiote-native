import { installRecordingFabric } from '@symbiote-native/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { cancelAnimation } from 'react-native-reanimated/src/animation';
import { renderComposable } from '../../../test-support/render-angular-composable';
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
  it('holds the initial value', async () => {
    const composable = await renderComposable(() => useSharedValue(5));

    expect(composable.result().value).toBe(5);
    composable.unmount();
  });

  it('calls a function initial value once, and holds what it returned', async () => {
    const initial = vi.fn(() => 'made');

    const composable = await renderComposable(() => useSharedValue(initial));

    expect(initial).toHaveBeenCalledTimes(1);
    expect(composable.result().value).toBe('made');
    composable.unmount();
  });

  it('cancels the animation it may be running once the component is gone', async () => {
    const composable = await renderComposable(() => useSharedValue(1));
    const shared = composable.result();

    composable.unmount();

    expect(cancelAnimation).toHaveBeenCalledWith(shared);
  });
});
