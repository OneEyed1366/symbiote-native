// The React Native twin of `svelte/reactivity/window`, with the same names and `.current` shape
// Upstream reads `window.innerWidth`, `window.devicePixelRatio` and friends, which are absent
// here and would read `undefined` forever, so these sit on real engine sources instead
//
// Two deliberate differences from upstream, both improvements:
//   - the type is `number`, not `number | undefined`. Upstream's `undefined` is its SSR branch;
//     there is no SSR here, and Dimensions always answers (it falls back to zero metrics when
//     DeviceInfo is unresolvable), so a consumer never has to unwrap.
//   - `outerWidth`/`outerHeight` are the physical screen, not a browser window in a desktop one.
//     On a device the app window is the screen minus system chrome (status bar, navigation bar)
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
export const devicePixelRatio: IReactiveValue<number> = createDimensionsValue(
  () => PixelRatio.get(),
);
