// The two seams that read react-native's own files and are the same on every platform

// @ts-expect-error react-native ships no types for this internal path (plain .js)
import resolveAssetSource from 'react-native/Libraries/Image/resolveAssetSource';
import type { IPressabilityClass } from '@symbiote-native/engine';

// Asset ids and `{uri}` sources go through RN's resolver before the shared render fns
// It is the module behind `Image.resolveAssetSource`, imported directly so the `Image` component
// (which loads React's renderer) stays out of every other adapter's bundle
export function defaultImageSourceResolver(source: unknown): unknown {
  return resolveAssetSource(source);
}

// RN's `Pressability` is not on its index and only `usePressability` needs it, so it loads on use
export function defaultPressabilityLoader(): IPressabilityClass {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('react-native/Libraries/Pressability/Pressability').default;
}
