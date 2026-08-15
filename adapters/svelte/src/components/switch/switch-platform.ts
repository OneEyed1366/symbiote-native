// Base / default: re-exports the iOS build. Metro overrides this with switch-platform.ios.ts /
// switch-platform.android.ts on a real host; under tsc/vitest the host config resolves here.
// Filename is the selector, no Platform.OS read — same convention as every other adapter's
// switch platform split.
export * from './switch-platform.ios';
