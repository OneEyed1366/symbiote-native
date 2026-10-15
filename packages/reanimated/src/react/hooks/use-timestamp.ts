import { useEffect } from 'react';
import type { SharedValue } from 'react-native-reanimated/src/commonTypes';
import { useAttachedFrameCallback } from './use-frame-callback';
import { useSharedValue } from './use-shared-value';

export function useTimestamp(isActive = true): SharedValue<number> {
  const timestamp = useSharedValue(0);
  const frameCallback = useAttachedFrameCallback(({ timeSinceFirstFrame }) => {
    'worklet';
    timestamp.value = timeSinceFirstFrame;
  }, isActive);
  useEffect(() => {
    frameCallback.setActive(isActive);
  }, [isActive, frameCallback]);
  return timestamp;
}
