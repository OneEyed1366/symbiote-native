// @symbiote-native/clipboard/react: the React entry over the framework-agnostic core. Unlike
// @symbiote-native/local-auth (all stateless functions, plain re-export), clipboard has one
// listener-based piece — useClipboard wraps addClipboardListener with React's own lifecycle
// (hooks/use-clipboard), mirroring the lifecycle-bucket naming convention of
// adapters/react/src/hooks (never `composables`, that's Vue's term) and the shape of
// @symbiote-native/sensors' useAccelerometer.

export { useClipboard } from './hooks/use-clipboard';
export * from '../core';
