import { installRecordingFabric } from '@symbiote-native/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '../../../test-support/render-hook';
import { useReducedMotion } from './use-reduced-motion';

installRecordingFabric();

// What the system reported when the app started
vi.mock('react-native-reanimated/src/ReducedMotion', () => ({
  isReducedMotionEnabledInSystem: () => true,
}));

describe('useReducedMotion', () => {
  it('tells whether the system asked for reduced motion when the app started', () => {
    const hook = renderHook(() => useReducedMotion(), undefined);

    expect(hook.latest()).toBe(true);
  });
});
