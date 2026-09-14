// ActivityIndicator's host behavior: the composition and the prop fold, below the framework, so the
// primitive is a bare `activity-indicator` tag and not five wrapper components.
//
// THE TWO-NODE SHAPE IS RN'S, not ours to collapse. `ActivityIndicator.js:112` opens a centering
// `<View>` around the native spinner, so the tag is that View and `buildStructure` builds
// `activity-indicator-spinner` under it. The container cannot be folded INTO the spinner either: it
// carries `alignItems`/`justifyContent`, which centre the spinner inside the space it was given,
// and moved onto the spinner they would centre its children, of which it has none.
//
// THE PLATFORM HALF IS THE SPINNER'S DEFAULTS AND NOTHING ELSE. iOS defaults the colour to RN's GRAY
// and needs no extra native props; Android's default is the theme, which means OMITTING the key
// rather than sending null (Fabric's colour parser rejects a null), plus `styleAttr` and
// `indeterminate` — without the first, AndroidProgressBar throws "setStyle() not called".
// `index.ios` / `index.android` supply them, the same file split `behaviors/scroll-view` uses.
//
// WHERE THE APP'S PROPS GO. `slotPropsExcept` is the COMPLEMENT of a rename map: everything an app
// writes on the tag routes to the spinner under its own name except `ACTIVITY_INDICATOR_HOST_PROPS`,
// which is RN's own split (`ActivityIndicator.js:99` spreads `...restProps` onto the spinner; `:113`
// keeps `onLayout` and `style` on the View). The set that moves is OPEN — every aria alias, every
// accessibility prop, whatever an app writes next — so a name map cannot express it.
//
// THE SIZE TRANSLATION IS PLATFORM-INVARIANT and lives here beside the fold that applies it: RN maps
// 'small'/'large' to a native size enum AND a fixed box style, while a NUMBER never reaches native
// at all (it sizes the spinner through style alone).
//
// Registered by all five adapters since 2026-09-09, in the same commit that deleted the five
// wrappers — the registry is keyed by TAG, so registering while a wrapper still painted its own
// spinner would have given every indicator two.
import {
  appendChild,
  createElement,
  registerHostBehavior,
  type IHostBehavior,
  type IPayloadFold,
  type IStyleProp,
  type ISymbioteEvent,
  type ISymbioteNode,
  type IViewStyle,
} from '@symbiote-native/engine';

import type {
  IAccessibilityProps,
  IAriaProps,
} from '../../accessibility-props';
import { descriptorFor } from '../../component-names';

export const ACTIVITY_INDICATOR_TAG = 'activity-indicator';

// The NATIVE spinner — `ActivityIndicatorView` on iOS, `AndroidProgressBar` on Android. Built by
// `buildStructure` below and by nothing else; no app writes it.
export const ACTIVITY_INDICATOR_SPINNER_TAG = 'activity-indicator-spinner';

export type IActivityIndicatorSize = 'small' | 'large' | number;

// Author-facing props: the framework-agnostic public surface every adapter re-exports. No framework
// element, ref or render callback, so it lives here once
// (<prop_types_split_agnostic_vs_per_adapter>); each adapter adds only its class-styling field.
export interface IActivityIndicatorProps
  extends IAccessibilityProps, IAriaProps {
  animating?: boolean;
  color?: string;
  size?: IActivityIndicatorSize;
  hidesWhenStopped?: boolean;
  style?: IStyleProp<IViewStyle>;
  // testID / nativeID / the accessibility surface land on the SPINNER, where RN spreads
  // `...restProps` (`ActivityIndicator.js:99`). `onLayout` is the exception RN itself makes
  // (`:113`): it measures the box the spinner is centred IN, so it belongs to the host.
  onLayout?: (event: ISymbioteEvent) => void;
}

// The per-platform pieces: the default spinner colour (iOS GRAY vs Android theme/null) and any extra
// native props the platform's spinner requires.
export type IActivityIndicatorPlatform = {
  defaultColor: string | null;
  nativeExtras: Readonly<Record<string, unknown>>;
};

// Fixed pixel boxes RN gives the two named sizes (styles.sizeSmall/sizeLarge).
const SIZE_SMALL_PX = 20;
const SIZE_LARGE_PX = 36;

// RN's own default when the app writes no `size` (ActivityIndicator.js:72).
const DEFAULT_SIZE: IActivityIndicatorSize = 'small';

// Centering wrapper RN puts around the spinner (styles.container).
const CONTAINER_STYLE: IViewStyle = {
  alignItems: 'center',
  justifyContent: 'center',
};

// The props that stay on the centering host instead of travelling to the spinner: RN's own two
// (`ActivityIndicator.js:113`) plus the spellings the ENGINE resolves against a node's own style.
const ACTIVITY_INDICATOR_HOST_PROPS: readonly string[] = [
  // A layout callback measures the box the spinner is centred IN, which is this node.
  'onLayout',
  // The composed `StyleSheet.compose(styles.container, style)` array (`:114`).
  'style',
  // A class NAME resolves to a style (`routeProp`'s class branch), so a class written on the tag has
  // to reach the centering view — the node `style` lands on — or the app's rule paints a spinner it
  // was never written for.
  'class',
  'className',
];

// `activeStyle` is deliberately NOT here. It looked like it belonged — it is slot 1 of the same
// `pushClassStyle` merge `style` and `class` feed — but this primitive has no pressed state, so
// `routeProp` consumes the key on whichever node it lands on and it never reaches Fabric either
// way. An entry no test can make fail is an entry that was never wired in.

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

// The HOST's fold: RN's `StyleSheet.compose(styles.container, style)` (ActivityIndicator.js:114).
// Base first, so an app style still wins.
const hostFold: IPayloadFold = props => ({
  ...props,
  style: [CONTAINER_STYLE, props.style],
});

function isActivityIndicatorSize(
  value: unknown,
): value is IActivityIndicatorSize {
  return value === 'small' || value === 'large' || typeof value === 'number';
}

// The SPINNER's fold — RN's own body (`ActivityIndicator.js:99-118`) applied to the node the app
// never names.
function spinnerFold(platform: IActivityIndicatorPlatform): IPayloadFold {
  return props => {
    const size = isActivityIndicatorSize(props.size)
      ? props.size
      : DEFAULT_SIZE;
    const { sizeStyle, sizeProp } = resolveSize(size);
    const next: Record<string, unknown> = {
      ...props,
      // RN defaults both to true and every wrapper spelled that `!== false`. A tag has no
      // destructuring default, so the fold is where the default has to live.
      animating: props.animating !== false,
      hidesWhenStopped: props.hidesWhenStopped !== false,
      style: sizeStyle,
    };
    // A NUMBER never reaches native: it sizes the spinner through style alone, and the native enum
    // takes 'small'/'large' only. So the key has to leave, not merely go unwritten.
    if (sizeProp === undefined) delete next.size;
    else next.size = sizeProp;
    const color =
      typeof props.color === 'string' ? props.color : platform.defaultColor;
    // Omitted rather than sent as null — Android's theme default is null and Fabric's colour parser
    // rejects one.
    if (color === null) delete next.color;
    else next.color = color;
    return next;
  };
}

// The composition. Returns the spinner as the slot because the prop redirect is gated on
// `childHost` being set — the redirect is what this slot is FOR, and NOT where children go: RN's
// ActivityIndicator renders only the spinner (`ActivityIndicator.js:112-118`) and takes no children
// at all. Hence `slotTakesNoChildren` below; without it a stray child would mount INSIDE the native
// spinner, which on Android is a `ProgressBar` and not a `ViewGroup` — the `addView` crash
// `IHostBehavior.slotTakesNoChildren` records for ImageBackground's Image.
function buildSpinner(platform: IActivityIndicatorPlatform) {
  return (node: ISymbioteNode): ISymbioteNode => {
    const descriptor = descriptorFor(ACTIVITY_INDICATOR_SPINNER_TAG);
    const spinner = createElement(
      descriptor.component,
      descriptor.isText,
      ACTIVITY_INDICATOR_SPINNER_TAG,
    );
    // Constants of the platform, never a function of a prop, so they are seeded at build time the
    // way ScrollView seeds `collapsable: false` — empty on iOS, AndroidProgressBar's two
    // requirements on Android.
    spinner.props = { ...platform.nativeExtras };
    spinner.payloadFold = spinnerFold(platform);
    appendChild(node, spinner);
    return spinner;
  };
}

function activityIndicatorBehavior(
  platform: IActivityIndicatorPlatform,
): IHostBehavior {
  return {
    slotPropsExcept: ACTIVITY_INDICATOR_HOST_PROPS,
    slotTakesNoChildren: true,
    buildStructure: buildSpinner(platform),
    foldPayload: hostFold,
    // Required by the interface and deliberately empty: this primitive owns no timer, no listener
    // and no native handshake. Written out rather than shared with a `noop` so the emptiness reads
    // as a decision.
    attach() {},
    detach() {},
  };
}

// Called by the platform files; nothing else should.
export function registerActivityIndicatorBehaviors(
  platform: IActivityIndicatorPlatform,
): void {
  registerHostBehavior(
    ACTIVITY_INDICATOR_TAG,
    activityIndicatorBehavior(platform),
  );
}
