// Base / default Switch: re-exports the iOS build. Metro overrides this with switch.ios.ts /
// switch.android.ts on a real host; under tsx / tsc / web the host config resolves here.
// Filename is the selector, no Platform.OS read. The logic lives in
// @symbiote-native/components/state, the render in @symbiote-native/components/view, and the
// hook in switch-shared.

export * from './index.ios';
