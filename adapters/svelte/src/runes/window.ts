// The React Native twin of `svelte/reactivity/window`. Upstream reads `window.innerWidth`,
// `window.outerWidth`, `window.devicePixelRatio` and friends, all of which are absent here — the
// dom-shim patches only the DOM classes stock compiled Svelte output touches (svelte-adapter-dom-
// shim skill), never the browser's window-metric properties — so every one of those values would
// read `undefined` forever and never update. Same names, same `.current` shape, real engine
// sources underneath.
//
// Two deliberate differences from upstream, both improvements:
//   - the type is `number`, not `number | undefined`. Upstream's `undefined` is its SSR branch;
//     there is no SSR here, and Dimensions always answers (it falls back to zero metrics when
//     DeviceInfo is unresolvable), so a consumer never has to unwrap.
//   - `outerWidth`/`outerHeight` are the physical SCREEN, not a "browser window inside a desktop
//     window" — the closest honest reading of outer-vs-inner on a device, where an app's window
//     is the screen minus system chrome (status bar, navigation bar).
//
// NOT provided, on purpose: `scrollX` / `scrollY` / `screenLeft` / `screenTop`. There is no
// window-level scroll offset in React Native (scrolling is per-ScrollView, observed through its
// own `onScroll`), and an app has no position within a desktop-style window manager. Rather than
// export a value that is always 0, or one that throws when it is finally read on a device, these
// are simply absent — the import fails at compile time, which the author sees immediately.
import { Dimensions, PixelRatio } from '@symbiote-native/engine';
import { createDimensionsValue, type IReactiveValue } from './dimensions-value';

export const innerWidth: IReactiveValue<number> = createDimensionsValue(
  () => Dimensions.get('window').width,
);

export const innerHeight: IReactiveValue<number> = createDimensionsValue(
  () => Dimensions.get('window').height,
);

export const outerWidth: IReactiveValue<number> = createDimensionsValue(
  () => Dimensions.get('screen').width,
);

export const outerHeight: IReactiveValue<number> = createDimensionsValue(
  () => Dimensions.get('screen').height,
);

// PixelRatio.get() IS Dimensions.get('window').scale, so the same 'change' event carries it.
export const devicePixelRatio: IReactiveValue<number> = createDimensionsValue(() =>
  PixelRatio.get(),
);
