// StyleSheet, ported from react-native/Libraries/StyleSheet/StyleSheetExports.js.
// RN's StyleSheet is mostly identity + small helpers: `create` returns the object
// untouched (no deep-freeze by default in modern RN), `flatten` collapses a style
// array, `compose` picks/pairs two styles, plus the `hairlineWidth` / `absoluteFill`
// constants. The typed ViewStyle/TextStyle live next door in styles.ts, so `create`
// is typed against them like RN's, not left generic over a plain Record.

import { isDevBuild } from '../platform/shared';
import { PixelRatio } from '../react-native-host';
import { flattenStyle } from '../style';
import {
  preprocessFlatStyle,
  setStylePreprocessor,
} from '../style-preprocessors';
import type { INamedStyles, IViewStyle, ITextStyle } from '../styles';
import { isRecord } from '../type-guards';

// RN constrains create with `T & NamedStyles<any>` to catch typos; we name the index
// shape concretely instead of `any`: every value must be a real style object.
type IStyleRecord = Record<string, IViewStyle | ITextStyle>;

// A single style object. Generic on purpose: shared is framework-agnostic and must
// not depend on the adapter's typed style maps.
type IStyleObject = Record<string, unknown>;

// RN's hairline factor: a "1 physical pixel" line is ~0.4 logical px, rounded to the
// nearest device pixel. Named so the 0.4 isn't a bare magic number (RN source uses
// the same literal in PixelRatio.roundToNearestPixel(0.4)).
const HAIRLINE_LOGICAL_FACTOR = 0.4;

// Compute the hairline width for a given scale, mirroring RN exactly: round the
// logical factor to the nearest device pixel, and if that rounds to 0 (scale < ~1.25)
// fall back to the thinnest representable line, one physical pixel = 1 / scale.
// Exported as a pure helper so the smoke can check the formula without faking native.
export function computeHairlineWidth(scale: number): number {
  const rounded = Math.round(HAIRLINE_LOGICAL_FACTOR * scale) / scale;
  return rounded === 0 ? 1 / scale : rounded;
}

// RN freezes absoluteFill in __DEV__; we always freeze so `absoluteFill` and
// `absoluteFillObject` can safely be the same shared object.
const absoluteFill: Readonly<IStyleObject> = Object.freeze({
  position: 'absolute',
  left: 0,
  right: 0,
  top: 0,
  bottom: 0,
});

// RN's composeStyles: a null/undefined side yields the other, else the pair [a, b]
// (which flatten later collapses, later keys winning). The test is null/undefined, NOT
// falsy - compose(0, y) returns [0, y], matching react-native's own
// src/private/styles/composeStyles.js, which branches on `== null`.
function compose<A, B>(style1: A, style2: B): A | B | [A, B] {
  if (style1 === null || style1 === undefined) return style2;
  if (style2 === null || style2 === undefined) return style1;
  return [style1, style2];
}

// RN `flattenStyle`: null и не-объект дают `undefined`, одиночный объект возвращается как есть
function flattenLikeRn(style: unknown): Record<string, unknown> | undefined {
  if (style === null || typeof style !== 'object') return undefined;
  if (Array.isArray(style)) return flattenStyle(style);
  return isRecord(style) ? style : undefined;
}

function flattenWithPreprocessors(
  style: unknown,
): Record<string, unknown> | undefined {
  const flat = flattenLikeRn(style);
  return flat === undefined ? undefined : preprocessFlatStyle(flat);
}

// RN's `StyleSheet.roundToNearestPixel` is `PixelRatio.roundToNearestPixel`
function roundToNearestPixel(value: number): number {
  return PixelRatio.roundToNearestPixel(value);
}

export const StyleSheet = {
  // Identity at runtime, like RN, but the NamedStyles constraint preserves each
  // string-literal style value (flexDirection: 'row' stays 'row', not string) and
  // validates entries, so `styles.box` is assignable to a ViewStyle prop.
  create<T extends INamedStyles<T> | IStyleRecord>(
    styles: T & IStyleRecord,
  ): T {
    // RN freezes each entry in a dev bundle, so a mutation fails at the line that makes it
    if (isDevBuild()) {
      for (const entry of Object.values(styles)) Object.freeze(entry);
    }
    return styles;
  },

  // Reuse the single flatten implementation; do not reimplement the clone-on-write
  // collapse here. The wrapper additionally applies any registered per-attribute
  // preprocessor as the style collapses to its flat payload.
  flatten: flattenWithPreprocessors,

  compose,

  setStyleAttributePreprocessor: setStylePreprocessor,
  roundToNearestPixel,

  absoluteFill,
  absoluteFillObject: absoluteFill,

  // Read lazily, since `PixelRatio` is only wired once the host hands `react-native` over
  get hairlineWidth(): number {
    return computeHairlineWidth(PixelRatio.get());
  },
};
