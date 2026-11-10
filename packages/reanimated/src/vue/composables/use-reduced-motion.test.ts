import { installRecordingFabric } from '@symbiote-native/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { renderComposable } from '../../../test-support/render-composable';
import { useReducedMotion } from './use-reduced-motion';

installRecordingFabric();

// What the system reported when the app started
vi.mock('react-native-reanimated/src/ReducedMotion', async importOriginal => ({
  ...(await importOriginal<
    typeof import('react-native-reanimated/src/ReducedMotion')
  >()),
  isReducedMotionEnabledInSystem: () => true,
}));

describe('useReducedMotion', () => {
  it('tells whether the system asked for reduced motion when the app started', () => {
    const composable = renderComposable(() => useReducedMotion());

    expect(composable.result()).toBe(true);
  });
});
