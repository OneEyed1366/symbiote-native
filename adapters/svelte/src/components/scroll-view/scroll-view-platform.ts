// Base / default: re-exports the iOS build. Metro overrides this with scroll-view-platform.ios.ts /
// scroll-view-platform.android.ts on a real host; under tsc/vitest the host config resolves here.
// Filename is the selector, no Platform.OS read — same convention as switch-platform.ts.
export * from './scroll-view-platform.ios';
