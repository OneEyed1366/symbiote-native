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
  type IStyleProp,
  type ISymbioteEvent,
  type ISymbioteNode,
  type IViewStyle,
  setProp,
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

// The two size boxes, the default size and the centering style are NOT here any more: they are
// literals inside `foldActivityIndicatorProps` / `foldActivityIndicatorSpinnerProps`
// (`SymbioteFabricProps.cpp`). Keeping a JS copy of a value only C++ reads is the mirror this port
// exists to remove — it would compile, export and test cleanly while nothing on a device consulted
// it.

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

// BOTH FOLDS LEFT THIS FILE on 2026-09-18 and neither was replaced by anything here: they are
// `foldActivityIndicatorProps` and `foldActivityIndicatorSpinnerProps` in `SymbioteFabricProps.cpp`.
// Every input either read was the node's own bag — no owner, no listener, no live state — which is
// what made them tag rules rather than composition, and it is why both nodes now cost ZERO trips
// into JS instead of one each. Contract:
// `core/engine/cpp/tests/js/activity-indicator-payload.itest.ts`.
//
// The size constants, the container style and the default colour went WITH them rather than staying
// as a second copy for the tests to assert. `platform.defaultColor` survives as the last field of
// `IActivityIndicatorPlatform` only because the rule's Android half is chosen by COMPONENT NAME in
// C++, so the JS value would have no reader — see the type's own note.

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
    for (const [key, value] of Object.entries(platform.nativeExtras))
      setProp(spinner, key, value);
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
  // A REGISTRATION WITH NO RUNTIME, and it is what hands the spinner's tag to the host.
  //
  // A tag crosses only through `recordSetTag`, which `attachHostBehavior` emits and nothing else
  // does — so a tag with no behavior registered carries an EMPTY `tagName` in C++ and no rule can
  // fire for it. The spinner is built by `buildStructure` and no app ever names it, so it had a tag,
  // had platform semantics, and the host could not see either. Its rule lives in
  // `SymbioteFabricProps.cpp` now (the size translation, RN's two `!== false` defaults, the
  // platform's default colour), which is why this registration has to exist even though there is no
  // JS left to run.
  //
  // Not a workaround for the seam: a registration is how this codebase declares that a tag HAS
  // platform semantics, which is exactly the claim. Emitting the tag from `createElement` for every
  // node was the alternative and is rejected where `attachHostBehavior` explains itself — an app's
  // own `<div>`-equivalent would pay an intern and an op to name something the host has no rule for.
  registerHostBehavior(ACTIVITY_INDICATOR_SPINNER_TAG, {
    attach() {},
    detach() {},
  });
}
