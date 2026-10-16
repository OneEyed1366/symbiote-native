import { useEffect, useState } from 'react';
import type { FrameInfo } from 'react-native-reanimated/src/frameCallback/FrameCallbackRegistryUI';
import type { FrameCallback } from 'react-native-reanimated/src/hook/useFrameCallback';
import { createFrameCallback } from '../../core/frame-callback';
import { requireWorklet } from '../../core/worklet-guard';

// The lifecycle alone, for a hook that brings a worklet of its own
export function useAttachedFrameCallback(
  callback: (frameInfo: FrameInfo) => void,
  autostart: boolean,
): FrameCallback {
  const [controller] = useState(() => createFrameCallback(autostart));
  useEffect(() => {
    return controller.attach(callback);
  }, [controller, callback, autostart]);
  return controller.callback;
}

export function useFrameCallback(
  callback: (frameInfo: FrameInfo) => void,
  autostart = true,
): FrameCallback {
  requireWorklet(callback, 'useFrameCallback');
  return useAttachedFrameCallback(callback, autostart);
}
