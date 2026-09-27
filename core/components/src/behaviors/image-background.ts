// ImageBackground's host behavior. RN's `ImageBackground.js:74-103` opens a `<View>` with the
// app's `style`, an absolutely-filled `<Image>` inside, children painted AFTER on top — this tag
// commits the same two nodes (`image-background` + its inner image).

// `childHost` normally answers both "where do owner props redirect" and "where do children go" —
// here they differ (image takes the spread, children stay on the owner), so
// `slotTakesNoChildren` splits them; not a JSX nicety, an Android `<Image>` is not a ViewGroup.

// RN spreads an OPEN prop set onto the Image (`ImageBackground.js:62-81`);
// `IMAGE_BACKGROUND_HOST_PROPS` below is the complement RN keeps on the wrapper instead.
import {
  appendChild,
  createElement,
  registerHostBehavior,
  type IHostBehavior,
  type ISymbioteNode,
} from '@symbiote-native/engine';

import { descriptorFor } from '../component-names';
import { IMAGE_TAG, registerImageBehavior } from './image';

export const IMAGE_BACKGROUND_TAG = 'image-background';

// The inner image's own tag. Distinct from `image` because the absolute fill must NOT reach a bare
// `<image>`, and a tag is the only thing a per-node rule can branch on.
export const IMAGE_BACKGROUND_IMAGE_TAG = 'image-background-image';

// Kept on the wrapper (`ImageBackground.js:74-78`), plus both class spellings — the slot redirect
// runs above the class branch, so an unlisted `class` would style the image instead. RN reapplies
// `importantForAccessibility` to BOTH nodes (:76,82); the image gets its own derived copy.
const IMAGE_BACKGROUND_HOST_PROPS = [
  'style',
  'class',
  'className',
  'importantForAccessibility',
];

// The owner props the image's payload is derived from. `importantForAccessibility` joins `style`
// for the reason above: a late write to either must re-fold the image, not just the box.
const IMAGE_BACKGROUND_SLOT_DERIVED = ['style', 'importantForAccessibility'];

// `imageStyle` is the wrapper's own name for the image's `style`. A bare class NAME is a legal
// value for it — every adapter's wrapper resolved one — and `routeProp` routes a string landing on
// `style` as `class` instead, so the registry resolves it on the image with nothing needed here.
const IMAGE_BACKGROUND_SLOT_PROPS = { imageStyle: 'style' };

// The owner's fold is GONE: its one job (`accessibilityIgnoresInvertColors: true`) is
// `foldImageBackgroundProps` in C++ now (`image-background-payload.itest.ts`).

// The image's fold is GONE too — `foldImageBackgroundImageProps` in C++, reading `ownerProps`
// from `node.parent` for the style proxy (`image-background-image-payload.itest.ts`).

// Returns the image, so `slotProps`/`slotPropsExcept`/`slotDerived` point at it; children stay on
// the owner via `slotTakesNoChildren`. Built WITH `IMAGE_TAG` so the engine's Image mapping still
// applies to it — the JS slot is free for composition only.

// ONE ORDERING DIFFERENCE, deliberate: the image rule folds its own `width`/`height` under its
// style, then the box's dimensions layer over that — RN nests it the other way
// (`ImageBackground.js:83-98`). Pinned in `image-background.test.ts` so it stays a decision.
//
// THE TAG IS ITS OWN, and that is what the C++ port needed. The node used to carry plain `image`,
// which is right for everything the ordinary image rule does and wrong for the fill — a bare
// `<image>` must NOT be absolutely positioned. `image-background-image` is served by BOTH rules, the
// ordinary one first, the same shape `usesPressableRule` gives `button` and the touchables. The
// COMPONENT still resolves through `IMAGE_TAG`, because the native view is an ordinary RCTImageView.
function buildBackgroundImage(node: ISymbioteNode): ISymbioteNode {
  const descriptor = descriptorFor(IMAGE_TAG);
  const image = createElement(
    descriptor.component,
    descriptor.isText,
    IMAGE_BACKGROUND_IMAGE_TAG,
  );
  appendChild(node, image);
  return image;
}

const imageBackgroundBehavior: IHostBehavior = {
  slotProps: IMAGE_BACKGROUND_SLOT_PROPS,
  slotPropsExcept: IMAGE_BACKGROUND_HOST_PROPS,
  slotDerived: IMAGE_BACKGROUND_SLOT_DERIVED,
  slotTakesNoChildren: true,
  buildStructure: buildBackgroundImage,
  // Required by the interface and deliberately empty: this primitive owns no timer, no listener
  // and no native handshake. Written out rather than shared with a `noop` so the emptiness reads
  // as a decision.
  attach() {},
  detach() {},
};

// The inner image's registration, and it is NOT a formality twice over.
//
// A tag reaches C++ only through `recordSetTag`, which `attachHostBehavior` emits — so a tag nobody
// registered carries an EMPTY `tagName` in the host and no rule fires for it, however the rule is
// written. Same reason the ActivityIndicator spinner and the scroll content nodes carry one.
//
// And `resolvesImageSources` has to be repeated here rather than inherited from `image`: the lookup
// is by TAG, this node's tag is its own, and the flag is what makes `routeProp` run
// `require('./photo.png')` through Metro's asset registry on the way in. Without it an
// ImageBackground would commit the raw asset NUMBER and paint nothing — headless included, since
// the resolution is JS-side by necessity.
const backgroundImageBehavior: IHostBehavior = {
  resolvesImageSources: true,
  attach() {},
  detach() {},
};

export function registerImageBackgroundBehavior(): void {
  // A REAL DEPENDENCY, declared rather than assumed. The inner node is a TAG now, so it gets its
  // platform half — the engine's two rules, and the write-time source resolution — only through
  // these registrations. It used to need nothing, because the fold was a function this file called
  // directly.
  //
  // `register.ts` registers everything anyway, so nothing in an app depended on this; what depended
  // on it was every test that registers one behavior and not the whole set, and a silent inner
  // image with no rule is precisely the failure that would reach a device before it reached a
  // suite. Idempotent, like every `register*` here.
  registerImageBehavior();
  registerHostBehavior(IMAGE_BACKGROUND_IMAGE_TAG, backgroundImageBehavior);
  registerHostBehavior(IMAGE_BACKGROUND_TAG, imageBackgroundBehavior);
}
