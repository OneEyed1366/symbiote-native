// Base / default ActivityIndicator. Re-exports the iOS build. Metro overrides this with
// activity-indicator.ios.ts / .android.ts on a real host; under tsx / tsc / web the host
// resolves here. Filename is the selector, no Platform.OS read.

export * from './index.ios';
