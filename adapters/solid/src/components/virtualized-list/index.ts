// Base / default VirtualizedList: re-exports the iOS build. Metro overrides this with index.ios.ts /
// index.android.ts on a real host; under vitest / tsc the resolution lands here. Filename is the
// selector, no Platform.OS read — the same shape scroll-view/index.ts has.

export * from './index.ios';
