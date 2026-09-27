// ActivityIndicator's host behavior: the composition and the prop fold, below the framework, so
// the primitive is a bare `activity-indicator` tag and not five wrapper components.

// The two-node shape is RN's, not ours to collapse: `ActivityIndicator.js:112` opens a centering
// View around the native spinner. The container can't fold into the spinner either — it carries
// `alignItems`/`justifyContent`, which would centre the spinner's own (nonexistent) children.

// The platform half is only the spinner's defaults: iOS defaults colour to GRAY with no extra
// props; Android's default is the theme (omit the key, Fabric rejects null) plus `styleAttr`/
// `indeterminate` (AndroidProgressBar throws without the first). Split across index.ios/.android.

// `slotPropsExcept` is the COMPLEMENT of a rename map: everything an app writes routes to the
// spinner except `ACTIVITY_INDICATOR_HOST_PROPS` (RN's own split, `ActivityIndicator.js:99,113`).
// The moved set is OPEN — every accessibility prop an app writes — a name map can't express it.

// The size translation is platform-invariant: RN maps 'small'/'large' to a native size enum plus
// a fixed box style, while a number sizes the spinner through style alone.
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

// Author-facing props: the framework-agnostic public surface every adapter re-exports (no
// framework element/ref/callback, `<prop_types_split_agnostic_vs_per_adapter>`).
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

// The per-platform pieces: the default spinner colour and any extra native props the platform's
// spinner requires.
export type IActivityIndicatorPlatform = {
  defaultColor: string | null;
  nativeExtras: Readonly<Record<string, unknown>>;
};

// The size boxes, default size, and centering style live only in `foldActivityIndicatorProps`/
// `foldActivityIndicatorSpinnerProps` (SymbioteFabricProps.cpp) — no JS copy of a value only C++
// reads.

// The props that stay on the centering host instead of travelling to the spinner: RN's own two
// (`ActivityIndicator.js:113`) plus the spellings the ENGINE resolves against a node's own style.
const ACTIVITY_INDICATOR_HOST_PROPS: readonly string[] = [
  // A layout callback measures the box the spinner is centred IN, which is this node.
  'onLayout',
  // The composed `StyleSheet.compose(styles.container, style)` array (`:114`).
  'style',
  // A class resolves to a style (`routeProp`'s class branch), so it must reach the centering view
  // — the node `style` lands on — or the app's rule paints a spinner it was never written for.
  'class',
  'className',
];

// `activeStyle` is deliberately NOT here: this primitive has no pressed state, so it never
// reaches Fabric — an entry no test can fail is one that was never wired in.

// Both prop folds are C++ now (`SymbioteFabricProps.cpp`), asserted in
// `core/engine/cpp/tests/js/activity-indicator-payload.itest.ts`. `platform.defaultColor` stays
// because the Android half is chosen by COMPONENT NAME in C++.

// Returns the spinner as the slot because the prop redirect gates on `childHost` being set — not
// because children go there: RN's ActivityIndicator takes no children at all, hence
// `slotTakesNoChildren` below (Android's ProgressBar isn't a ViewGroup and would crash on addView).
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
  // A registration with no runtime: a tag with no behavior registered carries an empty `tagName`
  // in C++ and no rule can fire for it, so this has to exist even though there's no JS left to run
  // — a registration is how this codebase declares a tag HAS platform semantics.
  registerHostBehavior(ACTIVITY_INDICATOR_SPINNER_TAG, {
    attach() {},
    detach() {},
  });
}
