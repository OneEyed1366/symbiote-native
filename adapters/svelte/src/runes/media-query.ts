// What replaces `MediaQuery` from `svelte/reactivity` here — and why it is deliberately NOT a
// `MediaQuery`-shaped class.
//
// `new MediaQuery('min-width: 800px')` takes an arbitrary CSS media-query STRING and answers it
// against `window.matchMedia`, which does not exist in React Native. A faithful-looking port
// would have to accept the same string and answer whatever it could from RN sources. The CSS
// media-query grammar has dozens of features; RN can honestly answer three or four of them. Every
// other one — `hover`, `pointer`, `prefers-reduced-motion`, `print`, `color-gamut`, `aspect-ratio`
// — would have to come back `false`, which is indistinguishable from a legitimate "no". That is
// precisely the "works by accident" dependency the symbiote-web-lib-portability-check skill says
// to reject: the failure is silent, on device, in a value the author already believes.
//
// So the surface is narrower and each supported feature is its own named export. An unsupported
// one is not a `false` — it is a name that does not exist, i.e. a compile error at the import.
// The three media features people actually reach for on a phone map cleanly:
//   (orientation: …)          -> `orientation` below
//   (min-width / max-width)   -> `createWidthQuery` below
//   (prefers-color-scheme)    -> the existing `useColorScheme()` rune, over Appearance.
// Dark mode is not re-exposed here: `useColorScheme()` already covers it and a second accessor
// for one value is duplication, not ergonomics.
import { Dimensions } from '@symbiote-native/engine';
import { createDimensionsValue, type IReactiveValue } from './dimensions-value';

export type IOrientation = 'portrait' | 'landscape';

// A square window counts as portrait, matching the CSS `(orientation: portrait)` definition
// (height >= width), not a coin flip.
export const orientation: IReactiveValue<IOrientation> = createDimensionsValue(() => {
  const { width, height } = Dimensions.get('window');
  return height >= width ? 'portrait' : 'landscape';
});

// Both bounds are inclusive, matching CSS `(min-width: …)` / `(max-width: …)`. Widths are in
// density-independent points — the same unit every style in this repo uses — not CSS pixels.
export interface IWidthQueryBounds {
  minWidth?: number;
  maxWidth?: number;
}

export function createWidthQuery(bounds: IWidthQueryBounds): IReactiveValue<boolean> {
  return createDimensionsValue(() => {
    const { width } = Dimensions.get('window');
    if (bounds.minWidth !== undefined && width < bounds.minWidth) return false;
    if (bounds.maxWidth !== undefined && width > bounds.maxWidth) return false;
    return true;
  });
}
