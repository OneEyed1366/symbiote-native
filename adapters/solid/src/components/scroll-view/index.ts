// Base / default ScrollView: re-exports the iOS build. Metro overrides this with index.ios.ts /
// index.android.ts on a real host; under vitest / tsc the resolution lands here. Filename is the
// selector, no Platform.OS read.
//
// ScrollViewStickyHeader is exported from here rather than from the platform files: it has no
// platform branch of its own, and an app may compose it directly around a section instead of going
// through `stickyHeaderIndices`.

export * from './index.ios';
export { ScrollViewStickyHeader } from './sticky-header';
