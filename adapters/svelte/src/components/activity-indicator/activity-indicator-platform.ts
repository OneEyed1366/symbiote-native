// Base / default: re-exports the iOS build. Metro overrides this with
// activity-indicator-platform.ios.ts / .android.ts on a real host; under tsc/vitest the host
// config resolves here. Filename is the selector, no Platform.OS read — same convention as
// switch/switch-platform.ts.
export * from './activity-indicator-platform.ios';
