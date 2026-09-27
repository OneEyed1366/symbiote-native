// ToastAndroid: base / headless build. Metro picks index.android.ts / index.ios.ts on a device; off
// those, RN's non-Android fallback is the default, as RN's own ToastAndroid.js is.

export * from './index.ios';
