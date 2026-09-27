// ToastAndroid off Android: RN's ToastAndroidFallback (ToastAndroid.ios.js). Zeroed constants and
// RN's own user-facing warning on every call; nothing reaches native.

const UNSUPPORTED = 'ToastAndroid is not supported on this platform.';

export const ToastAndroid = {
  SHORT: 0,
  LONG: 0,
  TOP: 0,
  BOTTOM: 0,
  CENTER: 0,

  show(_message: string, _duration: number): void {
    console.warn(UNSUPPORTED);
  },

  showWithGravity(_message: string, _duration: number, _gravity: number): void {
    console.warn(UNSUPPORTED);
  },

  showWithGravityAndOffset(
    _message: string,
    _duration: number,
    _gravity: number,
    _xOffset: number,
    _yOffset: number,
  ): void {
    console.warn(UNSUPPORTED);
  },
};
