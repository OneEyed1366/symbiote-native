// Base / default ScrollView. Re-exports the iOS build. Metro overrides this with
// scroll-view.ios.ts / scroll-view.android.ts on a real host; under tsx / tsc / web the host
// resolves here. Filename is the selector, no Platform.OS read.

export * from './index.ios';
