import type { FrameInfo } from 'react-native-reanimated/src/frameCallback/FrameCallbackRegistryUI';
import type { SharedValue } from 'react-native-reanimated/src/commonTypes';
import type { FrameCallback } from 'react-native-reanimated/src/hook/useFrameCallback';
import { createFrameCallback } from '../frame-callback';
import { requireWorklet } from '../worklet-guard';
import { snapshotWorklet } from '../worklet-snapshot';
import type { ISetupOnceLifecycle } from './lifecycle';

// The hooks that run a worklet on every frame of the UI side
export function createFrameHooks(
  { onDispose, readAccessor }: ISetupOnceLifecycle,
  useSharedValue: (initialValue: number) => SharedValue<number>,
) {
  // The lifecycle alone, for a hook that brings a worklet of its own
  function useAttachedFrameCallback(
    callback: (frameInfo: FrameInfo) => void,
    autostart: boolean,
  ): FrameCallback {
    const controller = createFrameCallback(autostart);
    onDispose(controller.attach(callback));
    return controller.callback;
  }

  function useFrameCallback(
    callback: (frameInfo: FrameInfo) => void,
    autostart = true,
  ): FrameCallback {
    const worklet = requireWorklet(callback, 'useFrameCallback');
    return useAttachedFrameCallback(
      snapshotWorklet(worklet, readAccessor),
      autostart,
    );
  }

  function useTimestamp(isActive = true): SharedValue<number> {
    const timestamp = useSharedValue(0);
    useAttachedFrameCallback(({ timeSinceFirstFrame }) => {
      'worklet';
      timestamp.value = timeSinceFirstFrame;
    }, isActive);
    return timestamp;
  }

  return { useFrameCallback, useTimestamp };
}
