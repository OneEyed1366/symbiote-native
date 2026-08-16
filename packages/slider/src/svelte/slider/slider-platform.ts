// Base / default: re-exports the iOS build. Metro overrides this with slider-platform.ios.ts /
// slider-platform.android.ts on a real host; under tsc/vitest the host config resolves here.
// Filename is the selector, no Platform.OS read — same convention as adapters/svelte's own
// switch-platform.ts.
export * from './slider-platform.ios';
