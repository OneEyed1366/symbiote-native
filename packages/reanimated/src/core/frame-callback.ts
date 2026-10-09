import FrameCallbackRegistryJS from 'react-native-reanimated/src/frameCallback/FrameCallbackRegistryJS';
import type { FrameInfo } from 'react-native-reanimated/src/frameCallback/FrameCallbackRegistryUI';
import type { FrameCallback } from 'react-native-reanimated/src/hook/useFrameCallback';

export type IFrameCallbackController = {
  callback: FrameCallback;
  // Registers the callback with the UI runtime; the returned detach drops it again
  attach: (callback: (frameInfo: FrameInfo) => void) => () => void;
};

// Made on first use: building it schedules work on the UI runtime, which an import must not do
let registry: FrameCallbackRegistryJS | undefined;

function sharedRegistry(): FrameCallbackRegistryJS {
  registry ??= new FrameCallbackRegistryJS();
  return registry;
}

export function createFrameCallback(
  autostart = true,
): IFrameCallbackController {
  const callback: FrameCallback = {
    setActive: isActive => {
      sharedRegistry().manageStateFrameCallback(callback.callbackId, isActive);
      callback.isActive = isActive;
    },
    isActive: autostart,
    callbackId: -1,
  };
  return {
    callback,
    attach: frameCallback => {
      callback.callbackId =
        sharedRegistry().registerFrameCallback(frameCallback);
      callback.setActive(callback.isActive);
      return () => {
        sharedRegistry().unregisterFrameCallback(callback.callbackId);
        callback.callbackId = -1;
      };
    },
  };
}
