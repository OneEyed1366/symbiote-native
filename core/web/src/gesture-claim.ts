// Whether the app owns the gesture under way and asked the native side to stay out of it. The
// engine reports it through the tree host, and the page side reads it to cancel a pan

import type { ITreeHost } from '@symbiote-native/engine';

export type IGestureClaim = {
  blocksNative: () => boolean;
  setIsJSResponder: ITreeHost['setIsJSResponder'];
};

export function createGestureClaim(): IGestureClaim {
  let isBlocked = false;
  return {
    blocksNative: () => isBlocked,
    setIsJSResponder: (_handle, isResponder, blockNativeResponder) => {
      isBlocked = isResponder && blockNativeResponder;
    },
  };
}
