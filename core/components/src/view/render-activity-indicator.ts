// ACTIVITYINDICATOR IS NOT A LOWERABLE PRIMITIVE, AND WILL NOT BECOME ONE. Decided 2026-09-01.
// It stays a component in every adapter; do not add it to `HOST_PRIMITIVES`.
//
// The reason is the `el('symbiote-view', wrapperProps, [el('symbiote-activity-indicator', …)])` at
// the bottom of this file: the render SYNTHESIZES a node that is not the primitive itself. A lowered
// tag is ONE engine node, and a host behavior's `foldPayload` maps props to props on that node — it
// cannot create a child. Lowering would therefore drop the centering container and change layout,
// which is an optimisation moving the observable surface, the one thing this design may not do.
//
// The wrapper is not over-building: RN's own `ActivityIndicator.js:112` renders a `<View>` around
// the native spinner too, so the two nodes are inherent. And the container cannot be folded INTO the
// spinner — it carries `alignItems`/`justifyContent`, which centre the spinner inside the space it
// was given; moved onto the spinner they would centre its children, of which it has none.
//
// The two alternatives were priced and both cost more than the primitive is worth. A behavior that
// CREATES a node needs a commit hook, i.e. a machine, i.e. a `-managed` tag split — a new category,
// not a fold. Synthesising the container inside the engine's commit walk is NOT the `RCTVirtualText`
// precedent it resembles: `viewNameFor` changes what one node IS and never ADDS one, so adding one
// would make the retained and committed trees disagree on node count — which every counter, census
// probe and benchmark in this repo assumes. Spinners are rare on a screen, so the per-instance cost
// lowering removes is not measurably paid here; the objection to leaving it is uniformity, not speed.
//
// Under half A this costs an app NOTHING: `View` and `ActivityIndicator` are both ordinary imports
// from the adapter barrel, so which one is internally a tag and which a component is invisible at
// the call site. The general rule is in `.claude/rules/host-primitive-tier.md`.
//
// ActivityIndicator: the render half (framework-agnostic). RN wraps the native spinner
// in a centering View and translates `size` in JS: 'small'/'large' map to a native size
// enum AND a fixed box style; a numeric size never reaches native (it sizes the spinner
// via style only). That translation is platform-invariant and lives here.
//
// What IS platform-specific: Android's AndroidProgressBar needs
// `styleAttr` (which triggers its setStyle(), without it the view throws "setStyle() not
// called") plus `indeterminate: true`, and its default color is the theme (null), whereas
// iOS's ActivityIndicatorView takes neither and defaults to GRAY. The adapter's per-host
// file supplies those bits via `platform`.

import { dlog } from '@symbiote-native/engine';
import type {
  IStyleProp,
  IViewStyle,
  ISymbioteEvent,
} from '@symbiote-native/engine';
import { el } from '../descriptor';
import type { IDescriptor } from '../descriptor';
import type { IAccessibilityProps, IAriaProps } from '../accessibility-props';

export type IActivityIndicatorSize = 'small' | 'large' | number;

// Author-facing props: the framework-agnostic public surface every adapter exposes. The
// fields are identical across adapters (no framework element / ref / children), so they live
// here once; each adapter only supplies its lifecycle + descriptor bridge.
export interface IActivityIndicatorProps
  extends IAccessibilityProps, IAriaProps {
  animating?: boolean;
  color?: string;
  size?: IActivityIndicatorSize;
  hidesWhenStopped?: boolean;
  style?: IStyleProp<IViewStyle>;
  // testID / nativeID / accessibility surface are inherited. RN spreads `...props` onto the
  // centering wrapper View, so they land on the wrapper, not the spinner.
  onLayout?: (event: ISymbioteEvent) => void;
}

// The pre-resolved inputs the render fn paints from. State and visual enter only through
// these props; accessibility / testID / onLayout arrive folded into `passthrough` and land
// on the wrapper untouched.
export type IActivityIndicatorViewProps = {
  animating: boolean;
  hidesWhenStopped: boolean;
  size: IActivityIndicatorSize;
  color?: string;
  style?: IStyleProp<IViewStyle>;
  passthrough: Record<string, unknown>;
};

// The per-platform pieces the render fn needs: the default spinner color (iOS GRAY vs
// Android theme/null) and any extra native props the platform's spinner requires
// (Android's styleAttr + indeterminate; none on iOS).
export type IActivityIndicatorPlatform = {
  defaultColor: string | null;
  nativeExtras: Readonly<Record<string, unknown>>;
};

// Fixed pixel boxes RN gives the two named sizes (styles.sizeSmall/sizeLarge).
const SIZE_SMALL_PX = 20;
const SIZE_LARGE_PX = 36;

// Centering wrapper RN puts around the spinner (styles.container).
const CONTAINER_STYLE: IViewStyle = {
  alignItems: 'center',
  justifyContent: 'center',
};

type INativeSize = {
  sizeStyle: IViewStyle;
  sizeProp?: 'small' | 'large';
};

function resolveSize(size: IActivityIndicatorSize): INativeSize {
  if (size === 'small') {
    return {
      sizeStyle: { width: SIZE_SMALL_PX, height: SIZE_SMALL_PX },
      sizeProp: 'small',
    };
  }
  if (size === 'large') {
    return {
      sizeStyle: { width: SIZE_LARGE_PX, height: SIZE_LARGE_PX },
      sizeProp: 'large',
    };
  }
  return { sizeStyle: { width: size, height: size } };
}

export function renderActivityIndicator(
  view: IActivityIndicatorViewProps,
  platform: IActivityIndicatorPlatform,
): IDescriptor {
  const { sizeStyle, sizeProp } = resolveSize(view.size);
  dlog(
    sizeProp !== undefined
      ? `ActivityIndicator size '${sizeProp}' -> native size enum '${sizeProp}'`
      : `ActivityIndicator size ${String(view.size)} -> style only, native size not set`,
  );

  const nativeProps: Record<string, unknown> = {
    animating: view.animating,
    hidesWhenStopped: view.hidesWhenStopped,
    style: sizeStyle,
    ...platform.nativeExtras,
  };
  // Omit color entirely when neither given nor defaulted (Android's theme default is
  // null); a null color prop would be rejected by Fabric's color parser.
  const resolvedColor = view.color ?? platform.defaultColor;
  if (resolvedColor !== null) nativeProps.color = resolvedColor;
  if (sizeProp !== undefined) nativeProps.size = sizeProp;

  dlog('ActivityIndicator -> RCTView(spinner)');

  const wrapperProps: Record<string, unknown> = {
    ...view.passthrough,
    style: [CONTAINER_STYLE, view.style],
  };

  return el('symbiote-view', wrapperProps, [
    el('symbiote-activity-indicator', nativeProps),
  ]);
}
